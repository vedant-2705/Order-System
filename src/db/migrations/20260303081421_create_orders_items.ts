import type { Knex } from "knex";

//  Migration: Create order_items table 
// Depends on: orders, products
// Junction table between orders and products.
// price_at_purchase captures the price at time of sale - immutable snapshot.
// This is critical: product prices can change, but this order's price is locked.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("order_items", (table) => {
        //  Primary Key 
        table.increments("id").primary();

        //  Foreign Keys 
        // CASCADE delete: if an order is deleted, its items go with it.
        // This is safe because order_items have no independent existence -
        // they only exist as part of an order.
        table
            .integer("order_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("orders")
            .onDelete("CASCADE")
            .onUpdate("CASCADE");

        // RESTRICT: cannot delete a product that appears in any order.
        // Use soft delete (deleted_at) on products instead.
        table
            .integer("product_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("products")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");

        //  Line Item Details 
        // How many units of this product were ordered.
        table.integer("quantity").notNullable();

        // Price per unit AT THE TIME OF PURCHASE.
        // Never reference products.price for historical orders -
        // the product price may have changed since.
        table.decimal("price_at_purchase", 12, 2).notNullable();
    });

    //  CHECK Constraints 
    await knex.raw(`
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_quantity_positive
    CHECK (quantity > 0)
  `);

    await knex.raw(`
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_price_positive
    CHECK (price_at_purchase > 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("order_items");
}
