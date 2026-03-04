/**
 * @module OrderItemRepository
 * @description Data-access layer for the `order_items` table.
 *
 * `order_items` rows are always created together with their parent `orders`
 * row inside a single transaction.  The only bulk-write operation is
 * `bulkCreate`, which inserts all line items for an order in one SQL
 * statement  avoiding N+1 insert loops.
 *
 * `order_items` rows are never updated or deleted (they are an immutable
 * ledger of what was ordered).
 *
 * Index coverage:
 *   - `idx_order_items_order_product` -> (order_id, product_id)
 *
 * @see modules/order-items/IOrderItemRepository.ts
 * @see modules/orders/use-cases/CreateOrderUseCase.ts
 */
import "reflect-metadata";
import { singleton } from "tsyringe";
import { CreateOrderItemInput, OrderItem } from "./types.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IOrderItemRepository } from "./IOrderItemRepository.js";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { Knex } from "knex";

/**
 * Concrete repository for the `order_items` table.
 *
 * @remarks
 * `@singleton()` ensures one Knex pool reference is shared across all
 * injections in the same process.
 */
@singleton()
export class OrderItemRepository
    extends BaseRepository<OrderItem>
    implements IOrderItemRepository
{
    protected readonly table = "order_items";

    constructor(dbProvider: DatabaseProvider) {
        super(dbProvider);
    }

    /**
     * Returns all order items belonging to a specific order.
     *
     * @remarks
     * Uses index `idx_order_items_order_product` (order_id, product_id).
     *
     * @param orderId - Primary key of the parent order.
     * @returns Array of order item rows; empty array if none.
     */
    async findByOrderId(orderId: number): Promise<OrderItem[]> {
        return this.db(this.table).where({ order_id: orderId });
    }

    /**
     * Returns all order items that reference a specific product.
     *
     * @remarks
     * Uses index `idx_order_items_order_product` (order_id, product_id).
     * 
     * @param productId - Primary key of the referenced product.
     * @returns Array of order item rows that include the product; empty array if none.
     * 
     * @see modules/product/use-cases/DeleteProductUseCase.ts for how this is used to check if a product can be safely deleted.
     */
    async findByProductId(productId: number): Promise<OrderItem[]> {
        return this.db(this.table).where({ product_id: productId });
    }

    /**
     * Inserts multiple order items in a single SQL statement.
     *
     * @remarks
     * Uses one `INSERT INTO ... VALUES (row1), (row2), ...` statement
     * regardless of how many items are in the order.  Never call this
     * in a loop  it defeats the purpose and saturates the connection pool.
     *
     * @param items - Array of line-item inputs for the order.
     * @param trx   - The active transaction (required; must be the same
     *                transaction that created the parent order row).
     * @returns The inserted order item rows.
     */
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
