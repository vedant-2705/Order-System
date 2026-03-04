/**
 * @module IOrderItemRepository
 * @description Repository interface for the `order_items` table.
 *
 * Injected by `ORDER_ITEM_REPOSITORY_TOKEN`.
 *
 * **Performance contract**: always use `bulkCreate` to insert items.
 * Never loop-insert items one by one  each insert is a separate
 * round-trip, which increases latency and lock-hold time.
 */
import { Knex } from "knex";
import { CreateOrderItemInput, OrderItem } from "./types.js";

/** DI injection token for {@link IOrderItemRepository}. */
export const ORDER_ITEM_REPOSITORY_TOKEN = Symbol("IOrderItemRepository");

export interface IOrderItemRepository {
    /** Returns all line items for a given order. */
    findByOrderId(orderId: string): Promise<OrderItem[]>;

    /** Returns all line items for a given product. */
    findByProductId(productId: string): Promise<OrderItem[]>;

    /**
     * Inserts all items for an order in a single SQL statement.
     * Never loop-insert items one by one  one call, one round-trip.
     */
    bulkCreate(
        items: CreateOrderItemInput[],
        trx: Knex.Transaction,
    ): Promise<OrderItem[]>;
}
