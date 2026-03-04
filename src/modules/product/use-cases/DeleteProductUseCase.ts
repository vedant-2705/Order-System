/**
 * @module DeleteProductUseCase
 * @description Soft-deletes a product after verifying no active orders reference it.
 *
 * A product referenced by pending/confirmed/processing orders cannot be deleted —
 * those orders need the product row for fulfilment.
 *
 * Uses soft-delete so existing order_items (which FK-reference products with
 * ON DELETE RESTRICT) remain intact.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { ConflictError } from "shared/errors/ConflictError.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "../IProductRepository.js";
import {
    type IOrderItemRepository,
    ORDER_ITEM_REPOSITORY_TOKEN,
} from "modules/order-items/IOrderItemRepository.js";
import {
    type IOrderRepository,
    ORDER_REPOSITORY_TOKEN,
} from "modules/orders/IOrderRepository.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

const BLOCKING_STATUSES = new Set(["pending", "confirmed", "processing"]);

@injectable()
export class DeleteProductUseCase {
    constructor(
        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(ORDER_ITEM_REPOSITORY_TOKEN)
        private readonly orderItemRepo: IOrderItemRepository,

        @inject(ORDER_REPOSITORY_TOKEN)
        private readonly orderRepo: IOrderRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(id: number): Promise<void> {
        this.logger.info("[DeleteProduct] Starting", { id });

        const product = await this.productRepo.findById(id);
        if (!product) {
            throw new NotFoundError(ErrorKeys.PRODUCT_NOT_FOUND, {
                id: String(id),
            });
        }

        // Check if any active orders contain this product
        const orderItems = await this.orderItemRepo.findByProductId(id);
        if (orderItems.length > 0) {
            const orderIds = [...new Set(orderItems.map((i) => i.order_id))];

            // Check if any of those orders are still active
            const activeOrders = await Promise.all(
                orderIds.map((oid) => this.orderRepo.findById(oid)),
            );

            const hasBlocking = activeOrders.some(
                (o) => o && BLOCKING_STATUSES.has(o.status),
            );

            if (hasBlocking) {
                throw new ConflictError(ErrorKeys.CONFLICT);
            }
        }
        
        await this.productRepo.softDelete(id);
        this.logger.info("[DeleteProduct] Completed", { id });
    }
}
