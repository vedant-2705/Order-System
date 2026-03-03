import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { Logger } from "utils/logger.js";
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

        @inject(Logger)
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
                throw new NotFoundError("WALLET_NOT_FOUND", {
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
            await Promise.all(
                items.map((item) =>
                    this.productRepo.deductStock(
                        item.product_id,
                        item.quantity,
                        trx,
                    ),
                ),
            );

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
