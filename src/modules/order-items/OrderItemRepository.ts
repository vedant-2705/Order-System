import "reflect-metadata";
import { singleton } from "tsyringe";
import { CreateOrderItemInput, OrderItem } from "./types.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IOrderItemRepository } from "./IOrderItemRepository.js";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { Knex } from "knex";

@singleton()
export class OrderItemRepository
    extends BaseRepository<OrderItem>
    implements IOrderItemRepository
{
    protected readonly table = "order_items";

    constructor(dbProvider: DatabaseProvider) {
        super(dbProvider);
    }

    // Hits idx_order_items_order_product.
    async findByOrderId(orderId: number): Promise<OrderItem[]> {
        return this.db(this.table).where({ order_id: orderId });
    }

    // Single bulk insert  1 round trip regardless of item count.
    async bulkCreate(
        items: CreateOrderItemInput[],
        trx: Knex.Transaction,
    ): Promise<OrderItem[]> {
        const rows = items.map((item) => ({
            order_id: item.orderId,
            product_id: item.productId,
            quantity: item.quantity,
            price_at_purchase: item.priceAtPurchase,
        }));

        return trx(this.table).insert(rows).returning("*");
    }
}
