/**
 * @module product/types
 * @description Domain types for the product module.
 *
 * `price` is typed as `string` because PostgreSQL `DECIMAL` columns are
 * returned as strings by the `pg` driver.  Always `parseFloat(product.price)`
 * before arithmetic to avoid floating-point surprises.
 */

/** Database row shape for the `products` table. */
export interface Product {
    id: string;
    name: string;
    description: string | null;
    price: string;           // DECIMAL -> string from pg driver; parseFloat() before use
    sku: string;             // unique stock-keeping unit identifier
    stock: number;           // current inventory count
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null; // null = active; non-null = soft-deleted
}
