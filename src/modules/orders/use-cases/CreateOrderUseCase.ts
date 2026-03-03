import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { Logger } from "utils/logger.js";
import { withAuditContext } from "utils/audit/WithAuditContext.js";
import {
    NotFoundError,
    InsufficientBalanceError,
    InsufficientStockError,
} from "../../shared/errors/AppError";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "modules/wallet/IWalletRepository.js";
import {
    type IOrderRepository,
    ORDER_REPOSITORY_TOKEN,
} from "../IOrderRepository.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "modules/product/IProductRepository.js";
import { CreateOrderInput, CreateOrderResult } from "../types.js";
import {
    type IWalletTransactionRepository,
    WALLET_TRANSACTION_REPOSITORY_TOKEN,
} from "modules/wallet-transaction/IWalletTransactionRepository.js";
import {
    type IOrderItemRepository,
    ORDER_ITEM_REPOSITORY_TOKEN,
} from "modules/order-items/IOrderItemRepository.js";

//  CreateOrderUseCase
// The most critical transaction in the system.
//
// Execution order is deliberate:
//   LOCK   -> acquire all row locks before any reads
//   READ   -> read locked data (guaranteed stable)
//   VALIDATE -> check business rules against stable data
//   WRITE  -> mutate (only after all checks pass)
//   COMMIT -> all 6 writes atomic
//
// Any throw before COMMIT causes automatic rollback via Knex.
// The audit trigger fires on each write - logged atomically with the data.

@injectable()
export class CreateOrderUseCase {
    constructor(
        @inject(DatabaseProvider)
        private readonly dbProvider: DatabaseProvider,

        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(WALLET_TRANSACTION_REPOSITORY_TOKEN)
        private readonly walletTxRepo: IWalletTransactionRepository,

        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(ORDER_REPOSITORY_TOKEN)
        private readonly orderRepo: IOrderRepository,

        @inject(ORDER_ITEM_REPOSITORY_TOKEN)
        private readonly orderItemRepo: IOrderItemRepository,

        @inject(Logger)
        private readonly logger: Logger,
    ) {}

    async execute(input: CreateOrderInput): Promise<CreateOrderResult> {
        const { userId, items, notes } = input;

        // Deduplicate product IDs - same product ordered twice should
        // be summed, not treated as two separate lock targets.
        const productIds = [...new Set(items.map((i) => i.product_id))];

        this.logger.info("[CreateOrder] Starting", { userId, productIds });

        return withAuditContext(this.dbProvider.getClient, async (trx) => {
            // ------------------------------------------------------------------
            // LOCK PHASE
            // Acquire ALL locks before reading or validating anything.
            //
            // Why locks first?
            //   Read -> validate -> lock -> write has a TOCTOU race:
            //     (Time Of Check vs Time Of Use)
            //     T1 reads balance=500, validates ok
            //     T2 reads balance=500, validates ok
            //     T1 locks, deducts -> balance=200
            //     T2 locks, deducts -> balance=-100 ← WRONG
            //
            //   Lock -> read -> validate -> write is safe:
            //     T1 locks wallet, reads balance=500, validates ok
            //     T2 tries to lock wallet -> BLOCKS
            //     T1 deducts -> balance=200, commits
            //     T2 unblocks, reads balance=200, validation fails -> rollback
            // ------------------------------------------------------------------

            //  1. Lock wallet
            const wallet = await this.walletRepo.findByUserIdForUpdate(
                userId,
                trx,
            );
            if (!wallet) {
                throw new NotFoundError("Wallet", userId);
            }

            //  2. Lock all products (ordered by id -> no deadlocks)
            // If two concurrent orders share some products, both transactions
            // try to lock in the same id order -> one blocks, no deadlock.
            const products = await this.productRepo.findByIdsForUpdate(
                productIds,
                trx,
            );

            // Verify every requested product exists and is active
            const productMap = new Map(products.map((p) => [p.id, p]));
            for (const item of items) {
                if (!productMap.has(item.product_id)) {
                    throw new NotFoundError("Product", item.product_id);
                }
            }

            // ------------------------------------------------------------------
            // VALIDATION PHASE
            // Data is now locked - safe to read and validate.
            // No other transaction can change wallet balance or product stock
            // until we commit or rollback.
            // ------------------------------------------------------------------

            //  3. Validate stock for every item
            // Check all items before throwing - better UX to surface all
            // stock issues at once rather than one at a time.
            const stockErrors: InsufficientStockError[] = [];

            for (const item of items) {
                const product = productMap.get(item.product_id)!;
                if (product.stock < item.quantity) {
                    stockErrors.push(
                        new InsufficientStockError(
                            item.product_id,
                            item.quantity,
                            product.stock,
                        ),
                    );
                }
            }

            if (stockErrors.length > 0) {
                // Throw the first one - client can re-validate after fixing it.
                // All errors are logged for observability.
                this.logger.warn("[CreateOrder] Insufficient stock", {
                    userId,
                    errors: stockErrors.map((e) => e.meta),
                });
                throw stockErrors[0];
            }

            //  4. Compute order total
            // Use product price from DB (locked row) - not from client input.
            // Client-supplied prices are NEVER trusted.
            // parseFloat because pg returns DECIMAL as string.
            let total = 0;
            const orderItemsData = items.map((item) => {
                const product = productMap.get(item.product_id)!;
                const price = parseFloat(product.price);
                const subtotal = price * item.quantity;
                total += subtotal;

                return {
                    productId: item.product_id,
                    quantity: item.quantity,
                    priceAtPurchase: price,
                };
            });

            // Round to 2 decimal places - avoid floating point drift
            total = Math.round(total * 100) / 100;

            //  5. Validate wallet balance
            const balance = parseFloat(wallet.balance);
            if (balance < total) {
                this.logger.warn("[CreateOrder] Insufficient balance", {
                    userId,
                    required: total,
                    available: balance,
                });
                throw new InsufficientBalanceError(total, balance);
            }

            // ------------------------------------------------------------------
            // WRITE PHASE
            // All locks held, all validations passed.
            // Every write below is part of the same transaction - all succeed
            // or all roll back together.
            // Audit trigger fires on each write automatically.
            // ------------------------------------------------------------------

            //  6. Deduct wallet balance
            const updatedWallet = await this.walletRepo.deductBalance(
                userId,
                total,
                trx,
            );

            this.logger.debug("[CreateOrder] Wallet deducted", {
                userId,
                amount: total,
                balanceBefore: balance,
                balanceAfter: parseFloat(updatedWallet.balance),
            });

            //  7. Record wallet transaction (immutable ledger)
            const walletTransaction = await this.walletTxRepo.create(
                {
                    walletId: wallet.id,
                    orderId: null, // set after order is created below
                    type: "debit",
                    amount: total,
                    balanceBefore: balance,
                    balanceAfter: parseFloat(updatedWallet.balance),
                    description: `Payment for order`,
                },
                trx,
            );

            //  8. Deduct stock for each product
            // Deduct all products concurrently within the transaction.
            // They're already locked - no race condition possible.
            await Promise.all(
                items.map(async (item) => {
                    const success = await this.productRepo.deductStock(
                        item.product_id,
                        item.quantity,
                        trx,
                    );

                    // This should never be false - we validated stock above and
                    // hold the lock. If it is false, something is very wrong.
                    if (!success) {
                        throw new InsufficientStockError(
                            item.product_id,
                            item.quantity,
                            productMap.get(item.product_id)!.stock,
                        );
                    }
                }),
            );

            //  9. Create order
            // order_number is auto-generated by DB trigger (ORD-YYYYMMDD-XXXXX).
            // status defaults to 'pending' per DB default.
            const order = await this.orderRepo.create(
                {
                    user_id: userId,
                    total_amount: String(total),
                    status: "pending",
                    notes: notes ?? null,
                },
                trx,
            );

            //  10. Bulk insert order items
            // Single INSERT for all items - 1 round trip, not N.
            const orderItems = await this.orderItemRepo.bulkCreate(
                orderItemsData.map((item) => ({
                    orderId: order.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    priceAtPurchase: item.priceAtPurchase,
                })),
                trx,
            );

            //  Update wallet transaction with order id
            // Now that we have the order id, link the transaction to it.
            // Raw update - no audit trigger concern (wallet_transactions not audited).
            await trx("wallet_transactions")
                .where({ id: walletTransaction.id })
                .update({ order_id: order.id });

            this.logger.info("[CreateOrder] Completed", {
                orderId: order.id,
                orderNumber: order.order_number,
                userId,
                total,
                itemCount: orderItems.length,
            });

            // COMMIT happens automatically when this function returns.
            // All 6 writes committed atomically.
            // Audit trigger has fired on: wallet, products (×N), orders, order_items (×N).
            return { order, items: orderItems };
        });
    }
}
