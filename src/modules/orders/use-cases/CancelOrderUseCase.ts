/**
 * @module CancelOrderUseCase
 * @description Cancels an order and refunds the wallet atomically.
 *
 * Only pending or confirmed orders can be cancelled.
 * Processing/completed orders cannot be cancelled (fulfilment already started).
 *
 * Execution flow (single transaction):
 *   LOCK     wallet row + order row
 *   VALIDATE order is in a cancellable state
 *   WRITE    order status -> cancelled
 *            wallet balance + refund amount (creditBalance)
 *            wallet_transactions INSERT (type: refund)
 *            product stock restored for each line item
 *   COMMIT   audit trigger fires on all writes
 *
 * Cache invalidation happens AFTER withAuditContext resolves (after commit).
 * Never invalidate inside the transaction - data is not committed yet.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { LOGGER, Logger } from "utils/logger.js";
import { withAuditContext } from "utils/audit/WithAuditContext.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { AppError } from "shared/errors/AppError.js";
import {
    type IOrderRepository,
    ORDER_REPOSITORY_TOKEN,
} from "../IOrderRepository.js";
import {
    type IOrderItemRepository,
    ORDER_ITEM_REPOSITORY_TOKEN,
} from "modules/order-items/IOrderItemRepository.js";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "modules/wallet/IWalletRepository.js";
import {
    type IWalletTransactionRepository,
    WALLET_TRANSACTION_REPOSITORY_TOKEN,
} from "modules/wallet-transaction/IWalletTransactionRepository.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "modules/product/IProductRepository.js";
import { Order } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";
import { CacheService } from "cache/CacheService.js";
import { CacheKeys } from "cache/CacheKeys.js";

const CANCELLABLE_STATUSES = new Set(["pending", "confirmed"]);

export interface CancelOrderResult {
    order: Order;
    refundAmount: number;
}

@injectable()
export class CancelOrderUseCase {
    constructor(
        @inject(DatabaseProvider)
        private readonly dbProvider: DatabaseProvider,

        @inject(ORDER_REPOSITORY_TOKEN)
        private readonly orderRepo: IOrderRepository,

        @inject(ORDER_ITEM_REPOSITORY_TOKEN)
        private readonly orderItemRepo: IOrderItemRepository,

        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(WALLET_TRANSACTION_REPOSITORY_TOKEN)
        private readonly walletTxRepo: IWalletTransactionRepository,

        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(LOGGER)
        private readonly logger: Logger,

        @inject(CacheService)
        private readonly cache: CacheService,
    ) {}

    async execute(
        orderId: string,
        requestingUserId: string,
    ): Promise<CancelOrderResult> {
        this.logger.info("[CancelOrder] Starting", {
            orderId,
            requestingUserId,
        });

        // Read order before transaction to get user_id for cache invalidation
        // (order will be locked inside withAuditContext for writes)
        const orderBeforeCancel = await this.orderRepo.findById(orderId);
        if (!orderBeforeCancel) {
            throw new NotFoundError(ErrorKeys.ORDER_NOT_FOUND, {
                id: String(orderId),
            });
        }

        const result = await withAuditContext(
            this.dbProvider.getClient,
            async (trx) => {
                // LOCK: order + wallet together
                const order = await this.orderRepo.findById(orderId);
                if (!order) {
                    throw new NotFoundError(ErrorKeys.ORDER_NOT_FOUND, {
                        id: String(orderId),
                    });
                }

                // VALIDATE: only pending/confirmed orders can be cancelled
                if (!CANCELLABLE_STATUSES.has(order.status)) {
                    throw new AppError(ErrorKeys.ORDER_CANNOT_BE_CANCELLED, {
                        orderNumber: order.order_number,
                        status: order.status,
                    });
                }

                const wallet = await this.walletRepo.findByUserIdForUpdate(
                    order.user_id,
                    trx,
                );
                if (!wallet) {
                    throw new NotFoundError(ErrorKeys.WALLET_NOT_FOUND, {
                        userId: String(order.user_id),
                    });
                }

                const refundAmount = parseFloat(order.total_amount);
                const balanceBefore = parseFloat(wallet.balance);

                // WRITE 1: update order status -> cancelled
                const cancelledOrder = await this.orderRepo.updateStatus(
                    orderId,
                    "cancelled",
                    trx,
                );

                // WRITE 2: credit wallet with refund
                const updatedWallet = await this.walletRepo.creditBalance(
                    order.user_id,
                    refundAmount,
                    trx,
                );

                // WRITE 3: immutable refund ledger entry
                await this.walletTxRepo.create(
                    {
                        walletId: wallet.id,
                        orderId: orderId,
                        type: "refund",
                        amount: refundAmount,
                        balanceBefore,
                        balanceAfter: parseFloat(updatedWallet.balance),
                        description: `Refund for cancelled order ${order.order_number}`,
                    },
                    trx,
                );

                // WRITE 4: restore stock for each line item
                const items = await this.orderItemRepo.findByOrderId(orderId);
                await Promise.all(
                    items.map((item) =>
                        trx("products")
                            .where({ id: item.product_id })
                            .update({
                                stock: trx.raw("stock + ?", [item.quantity]),
                                updated_at: trx.fn.now(),
                            }),
                    ),
                );

                this.logger.info("[CancelOrder] Completed", {
                    orderId,
                    orderNumber: order.order_number,
                    refundAmount,
                });

                return { order: cancelledOrder!, refundAmount };
            },
        );

        // Transaction committed
        // Invalidate cache AFTER commit - data is now persisted and safe to expose
        await Promise.all([
            this.cache.del(CacheKeys.orderById(orderId)),
            this.cache.invalidatePattern(
                CacheKeys.ordersByUserPattern(orderBeforeCancel.user_id),
            ),
            this.cache.del(CacheKeys.orderStats()),
        ]);

        return result;
    }
}
