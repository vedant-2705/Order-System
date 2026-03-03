import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Knex } from "knex";
import {
    type IOrderRepository,
    ORDER_REPOSITORY_TOKEN,
} from "../IOrderRepository.js";
import { Order } from "../types.js";
import { ComputedLineItem } from "./OrderValidationService.js";
import { OrderItem } from "modules/order-items/types.js";
import { type IOrderItemRepository, ORDER_ITEM_REPOSITORY_TOKEN } from "modules/order-items/IOrderItemRepository.js";

export interface PersistOrderInput {
    userId: number;
    total: number;
    lineItems: ComputedLineItem[];
    notes?: string | null;
}

export interface PersistOrderResult {
    order: Order;
    items: OrderItem[];
}

/**
 * Responsible for the write phase of order creation:
 *   1. INSERT into orders (order_number auto-set by trigger)
 *   2. Bulk INSERT into order_items (single query)
 *
 * Always called inside an existing transaction from CreateOrderUseCase.
 * Does not manage the transaction itself - the use case owns that.
 */
@injectable()
export class OrderPersistenceService {
    constructor(
        @inject(ORDER_REPOSITORY_TOKEN)
        private readonly orderRepo: IOrderRepository,

        @inject(ORDER_ITEM_REPOSITORY_TOKEN)
        private readonly orderItemRepo: IOrderItemRepository,
    ) {}

    async persist(
        input: PersistOrderInput,
        trx: Knex.Transaction,
    ): Promise<PersistOrderResult> {
        // Create order 
        // order_number is set by the DB trigger - we don't pass it.
        // status defaults to 'pending' per DB default.
        const order = await this.orderRepo.create(
            {
                user_id: input.userId,
                total_amount: String(input.total),
                status: "pending",
                notes: input.notes ?? null,
            },
            trx,
        );

        // Bulk insert order items - 1 round trip 
        const items = await this.orderItemRepo.bulkCreate(
            input.lineItems.map((li) => ({
                orderId: order.id,
                productId: li.productId,
                quantity: li.quantity,
                priceAtPurchase: li.priceAtPurchase,
            })),
            trx,
        );

        return { order, items };
    }
}
