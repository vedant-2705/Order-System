/**
 * @module order-items/types
 * @description Domain types for the order-items module.
 *
 * `price_at_purchase` is typed as `string` because PostgreSQL `DECIMAL`
 * columns are returned as strings by the `pg` driver.  Snapshot semantics:
 * the price stored here is the price at the moment of purchase and must
 * never be updated even if the product's price changes later.
 */

/** Database row shape for the `order_items` table. */
export interface OrderItem {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    price_at_purchase: string; // DECIMAL -> string from pg driver; price snapshot at time of purchase
}

/** Input shape for creating a single order item (used in `bulkCreate`). */
export interface CreateOrderItemInput {
    orderId: string;
    productId: string;
    quantity: number;
    priceAtPurchase: number; // camelCase input; mapped to snake_case before insert
}

/** Shape of a single item as submitted by the client in a create-order request. */
export interface CreateOrderRequestItem {
    product_id: string;
    quantity: number;
}