import { Knex } from "knex";
import { CreateOrderItemInput, OrderItem } from "./types.js";

export const ORDER_ITEM_REPOSITORY_TOKEN = Symbol("IOrderItemRepository");

export interface IOrderItemRepository {
    findByOrderId(orderId: number): Promise<OrderItem[]>;

    // Single bulk insert  never loop-insert items one by one.
    bulkCreate(
        items: CreateOrderItemInput[],
        trx: Knex.Transaction,
    ): Promise<OrderItem[]>;
}
