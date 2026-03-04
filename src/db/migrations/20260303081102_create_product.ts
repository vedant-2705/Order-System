import type { Knex } from "knex";

//  Migration: Create products table 
// No FK dependencies - can be created independently of users.
// Includes soft delete so product history is preserved in order_items.
// If a product is hard-deleted, old orders referencing it break.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("products", (table) => {
        //  Primary Key 
        table.uuid("id").primary().defaultTo(knex.fn.uuid());

        //  Core Fields 
        table.string("name", 255).notNullable();
        table.text("description").nullable();

        // DECIMAL(12,2): supports up to 999,999,999,999.99
        // Never use FLOAT for money - floating point arithmetic errors.
        // e.g. 0.1 + 0.2 = 0.30000000000000004 in IEEE 754
        table.decimal("price", 12, 2).notNullable();

        // SKU (Stock Keeping Unit) - unique business identifier for the product.
        // Used for inventory management, imports, integrations.
        // B-Tree index added in migration 008 for fast lookups.
        table.string("sku", 100).notNullable().unique();

        // Stock quantity - CHECK constraint prevents negative stock.
        // Application validates first, DB enforces absolutely.
        // defaultTo(0) means newly added products start with no stock.
        table.integer("stock").notNullable().defaultTo(0);

        //  Timestamps 
        table.timestamps(true, true);
        table.timestamp("deleted_at").nullable();
    });

    //  CHECK Constraints 
    // Knex doesn't have a clean API for CHECK constraints - use raw.

    // Prevent negative stock at DB level.
    // Even if application code has a bug, this is the final safety net.
    await knex.raw(`
    ALTER TABLE products
    ADD CONSTRAINT products_stock_non_negative
    CHECK (stock >= 0)
  `);

    // Prevent zero or negative prices - a product must have positive value.
    await knex.raw(`
    ALTER TABLE products
    ADD CONSTRAINT products_price_positive
    CHECK (price > 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("products");
}
