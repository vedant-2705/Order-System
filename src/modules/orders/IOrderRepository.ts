/**
 * @module IOrderRepository
 * @description Repository interface for the `orders` table.
 *
 * Defines the contract that `OrderRepository` implements.
 * Injected by token `ORDER_REPOSITORY_TOKEN` so the DI container can
 * swap implementations (e.g. for integration tests with a fake repo).
 */
import { Knex } from "knex";
import { Order, OrderStatus } from "./types.js";

/** DI injection token for {@link IOrderRepository}. */
export const ORDER_REPOSITORY_TOKEN = Symbol("IOrderRepository");

export interface IOrderRepository {
    findById(id: string): Promise<Order | null>;
    findByOrderNumber(orderNumber: string): Promise<Order | null>;
    findByUserId(userId: string): Promise<Order[]>;
    create(data: Partial<Order>, trx: Knex.Transaction): Promise<Order>;
    updateStatus(
        id: string,
        status: OrderStatus,
        trx?: Knex.Transaction,
    ): Promise<Order | null>;
    softDelete(id: string): Promise<void>;
}