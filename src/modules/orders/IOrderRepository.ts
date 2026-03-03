import { Knex } from "knex";
import {
    Order,
    OrderStatus,
} from "./types.js";

//  IOrderRepository 
export const ORDER_REPOSITORY_TOKEN = Symbol("IOrderRepository");

export interface IOrderRepository {
    findById(id: number): Promise<Order | null>;
    findByOrderNumber(orderNumber: string): Promise<Order | null>;
    findByUserId(userId: number): Promise<Order[]>;
    create(data: Partial<Order>, trx: Knex.Transaction): Promise<Order>;
    updateStatus(
        id: number,
        status: OrderStatus,
        trx?: Knex.Transaction,
    ): Promise<Order | null>;
    softDelete(id: number): Promise<void>;
}