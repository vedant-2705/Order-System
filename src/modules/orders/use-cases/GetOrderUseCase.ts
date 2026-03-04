/**
 * @module GetOrderUseCase
 * @description Read-only use cases for fetching orders and their line items.
 *
 * Three query paths are exposed as methods on a single injectable class
 * rather than three separate use-case classes, because all three share the
 * same two repository dependencies and have no write side-effects.
 *
 * Methods:
 *   - `getById`         -> fetch one order + its items by internal PK
 *   - `getByOrderNumber`-> fetch one order + its items by human-readable number
 *   - `getByUserId`     -> fetch all orders for a user (no items - list view)
 *
 * No transaction needed - these are pure reads with no concurrency concerns.
 *
 * @see modules/orders/IOrderRepository.ts
 * @see modules/order-items/IOrderItemRepository.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { LOGGER, Logger } from "utils/logger.js";
import {
    type IOrderRepository,
    ORDER_REPOSITORY_TOKEN,
} from "../IOrderRepository.js";
import {
    type IOrderItemRepository,
    ORDER_ITEM_REPOSITORY_TOKEN,
} from "modules/order-items/IOrderItemRepository.js";
import { Order } from "../types.js";
import { OrderItem } from "modules/order-items/types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

/** Shape returned by single-order queries (order + its line items). */
export interface OrderWithItems {
    order: Order;
    items: OrderItem[];
}

/**
 * Read-only use case for order retrieval.
 *
 * @remarks
 * All methods are non-transactional reads.  No locks are acquired.
 * Soft-deleted orders are invisible (filtered by `BaseRepository.query()`).
 */
@injectable()
export class GetOrderUseCase {
    constructor(
        @inject(ORDER_REPOSITORY_TOKEN)
        private readonly orderRepo: IOrderRepository,

        @inject(ORDER_ITEM_REPOSITORY_TOKEN)
        private readonly orderItemRepo: IOrderItemRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    /**
     * Fetches a single order by its internal primary key, including line items.
     *
     * @param id - Internal PK of the order.
     * @throws {NotFoundError} ORDER_NOT_FOUND if the order does not exist or is soft-deleted.
     */
    async getById(id: number): Promise<OrderWithItems> {
        this.logger.debug("[GetOrder] By ID", { id });

        const order = await this.orderRepo.findById(id);
        if (!order) {
            throw new NotFoundError(ErrorKeys.ORDER_NOT_FOUND, { id: String(id) });
        }

        const items = await this.orderItemRepo.findByOrderId(order.id);

        return { order, items };
    }

    /**
     * Fetches a single order by its human-readable order number (e.g. ORD-20240115-00042),
     * including line items.
     *
     * @param orderNumber - The business-facing order identifier.
     * @throws {NotFoundError} ORDER_NOT_FOUND if the order does not exist or is soft-deleted.
     */
    async getByOrderNumber(orderNumber: string): Promise<OrderWithItems> {
        this.logger.debug("[GetOrder] By order number", { orderNumber });

        const order = await this.orderRepo.findByOrderNumber(orderNumber);
        if (!order) {
            throw new NotFoundError(ErrorKeys.ORDER_NOT_FOUND, { orderNumber });
        }

        const items = await this.orderItemRepo.findByOrderId(order.id);

        return { order, items };
    }

    /**
     * Returns all active orders for a user, newest first.
     *
     * @remarks
     * Returns orders only - no line items.  The list view does not need
     * per-order item detail; that is fetched on demand via `getById`.
     * This keeps the query fast and avoids N+1 item fetches for long lists.
     *
     * @param userId - Primary key of the user.
     */
    async getByUserId(userId: number): Promise<Order[]> {
        this.logger.debug("[GetOrder] By user ID", { userId });
        return this.orderRepo.findByUserId(userId);
    }
}
