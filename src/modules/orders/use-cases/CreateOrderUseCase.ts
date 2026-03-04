/**
 * @module CreateOrderUseCase
 * @description Orchestrates the complete, atomic order creation flow.
 *
 * This use case owns the transaction and the locking strategy.
 * It delegates validation, persistence, and wallet deduction to
 * focused single-responsibility services.
 *
 * Execution phases (order must not change):
 *
 * ```
 * LOCK     wallet row + product rows     (FOR UPDATE, consistent lock order)
 * VALIDATE stock levels + compute total  (reads are safe after locks)
 * WRITE    order + items + wallet ledger + stock deduction  (all atomic)
 * COMMIT   audit trigger fires on every write inside withAuditContext()
 * ```
 *
 * Why this order?
 *   - Acquiring locks before reading prevents TOCTOU races.
 *   - Consistent lock ordering (wallet -> products by ascending id) prevents
 *     deadlocks when two concurrent requests target overlapping products.
 *
 * @see modules/orders/services/OrderValidationService.ts
 * @see modules/orders/services/OrderPersistenceService.ts
 * @see modules/wallet/services/WalletDeductionService.ts
 * @see utils/audit/WithAuditContext.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { LOGGER, Logger } from "utils/logger.js";
import { withAuditContext } from "utils/audit/WithAuditContext.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "modules/wallet/IWalletRepository.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "modules/product/IProductRepository.js";
import { OrderValidationService } from "../services/OrderValidationService.js";
import { OrderPersistenceService } from "../services/OrderPersistenceService.js";
import { WalletDeductionService } from "modules/wallet/services/WalletDeductionService.js";
import { CreateOrderInput, CreateOrderResult } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

/**
 * Orchestrates the full order creation flow.
 * Owns the transaction and the lock phase.
 * Delegates validation, persistence, and wallet logic to focused services.
 *
 * Execution order (must not change):
 *   LOCK     -> wallet + products (prevents lost-update and race conditions)
 *   VALIDATE -> stock + balance (safe to check after locks)
 *   WRITE    -> wallet, ledger, stock, order, items (all atomic)
 *   COMMIT   -> audit trigger fires on each write
 */
@injectable()
export class CreateOrderUseCase {
    constructor(
        @inject(DatabaseProvider)
        private readonly dbProvider: DatabaseProvider,

        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(OrderValidationService)
        private readonly validationService: OrderValidationService,

        @inject(OrderPersistenceService)
        private readonly persistenceService: OrderPersistenceService,

        @inject(WalletDeductionService)
        private readonly walletDeductionService: WalletDeductionService,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(input: CreateOrderInput): Promise<CreateOrderResult> {
        const { userId, items, notes } = input;
        const productIds = [...new Set(items.map((i) => i.product_id))];

        this.logger.info("[CreateOrder] Starting", { userId, productIds });

        return withAuditContext(this.dbProvider.getClient, async (trx) => {
            //  LOCK PHASE 
            // Acquire all locks before reading anything.
            // Lock order: wallet first, then products (consistent order = no deadlocks).

            const wallet = await this.walletRepo.findByUserIdForUpdate(
                userId,
                trx,
            );
            if (!wallet) {
                throw new NotFoundError(ErrorKeys.WALLET_NOT_FOUND, {
                    userId: String(userId),
                });
            }

            const products = await this.productRepo.findByIdsForUpdate(
                productIds,
                trx,
            );

            //  VALIDATE PHASE 
            // Data is now locked  no other transaction can change it until we commit.
            // Delegates to OrderValidationService: checks stock, computes total from DB prices.

            const { lineItems, total } = this.validationService.validate(
                items,
                products,
            );

            //  WRITE PHASE 
            // All checks passed. Write in dependency order.

            // Create order record first so we have an order.id for the ledger entry
            const { order, items: orderItems } =
                await this.persistenceService.persist(
                    { userId, total, lineItems, notes },
                    trx,
                );

            // Deduct wallet + record ledger entry (validates balance internally)
            await this.walletDeductionService.deduct(
                wallet,
                total,
                order.id,
                trx,
            );

            // Deduct stock for each product
            const stockResults = await Promise.all(
                items.map((item) =>
                    this.productRepo.deductStock(
                        item.product_id,
                        item.quantity,
                        trx,
                    ),
                ),
            );

            const failedDeductions = stockResults
                .map((ok, i) => (!ok ? items[i] : null))
                .filter(Boolean);

            if (failedDeductions.length > 0) {
                // Throwing here triggers automatic rollback - order and wallet
                // writes above will be rolled back too. Clean state restored.
                this.logger.error("[CreateOrder] Stock deduction failed after validation", {
                    failedItems: failedDeductions,
                });
                throw new Error(
                    "Stock deduction failed for one or more products - this should not happen",
                );
            }

            this.logger.info("[CreateOrder] Completed", {
                orderId: order.id,
                orderNumber: order.order_number,
                userId,
                total,
                items: orderItems.length,
            });

            return { order, items: orderItems };
        });
    }
}
