import type { Knex } from "knex";

//  Migration: Indexes 
// All indexes in a single migration - separate from table creation.
// Reason: index decisions are query-pattern driven. Separating them
// makes it easy to add/remove indexes independently as query patterns evolve.
//
// All indexes use CREATE INDEX CONCURRENTLY - safe on tables with existing data.
// CONCURRENTLY builds the index without holding a write-blocking lock.
//
// IMPORTANT: CONCURRENTLY cannot run inside a transaction block.
// This migration must run with { transaction: false }.

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    // ------------------------------------------------------------------------
    // USERS
    // ------------------------------------------------------------------------

    // B-Tree index on email.
    // WHY: Every login, every "find user by email" query hits this.
    //      Without it: full table scan on every authentication attempt.
    //      email is already UNIQUE (which creates an index), but we make it
    //      explicit here with a partial condition for active users only.
    // Query it serves: WHERE email = $1 AND deleted_at IS NULL
    await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
    ON users(email)
    WHERE deleted_at IS NULL
  `);

    // ------------------------------------------------------------------------
    // PRODUCTS
    // ------------------------------------------------------------------------

    // B-Tree index on SKU.
    // WHY: SKU is the external product identifier used in imports, integrations,
    //      and admin operations. Lookups by SKU must be instant.
    // Already has UNIQUE constraint (which creates an index automatically),
    // so this is documented here for clarity but not re-created.
    // Query it serves: WHERE sku = $1
    // Note: The UNIQUE constraint on sku in the table definition already
    //       creates this index. Listed here for documentation purposes.

    // Partial B-Tree index: purchasable products only.
    // WHY: Order creation queries "give me this product if it's in stock and active."
    //      The full products table has deleted and out-of-stock products too -
    //      this index is a surgical slice of only purchasable products.
    //      Smaller index -> fits in memory -> faster scans.
    //      As products sell out, they automatically leave this index.
    // Query it serves: WHERE id = ANY($1) AND stock > 0 AND deleted_at IS NULL
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_purchasable
    ON products(id)
    WHERE stock > 0 AND deleted_at IS NULL
  `);

    // B-Tree index on product name for active products.
    // WHY: Product search/listing queries filter by name pattern.
    //      Partial index (deleted_at IS NULL) keeps it lean -
    //      deleted products are never searched.
    // Query it serves: WHERE name ILIKE $1 AND deleted_at IS NULL
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_active
    ON products(name)
    WHERE deleted_at IS NULL
  `);

    // ------------------------------------------------------------------------
    // ORDERS
    // ------------------------------------------------------------------------

    // Composite B-Tree index: (user_id, created_at DESC).
    // WHY: The most common order query is "get all orders for user X, newest first."
    //      Composite index satisfies both the WHERE (user_id) and ORDER BY (created_at).
    //      Without this: index scan on user_id, then sort - two operations.
    //      With this: single index scan returns results already ordered.
    // Column order: user_id first (equality), created_at second (range/sort).
    //      Left-prefix rule: user_id must come first because it's the equality filter.
    //      If we put created_at first, a query for a specific user couldn't use it.
    // Query it serves: WHERE user_id = $1 ORDER BY created_at DESC
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_created
    ON orders(user_id, created_at DESC)
    WHERE deleted_at IS NULL
  `);

    // Partial B-Tree index: pending orders only.
    // WHY: Order processing systems constantly poll for pending orders.
    //      'pending' is a small fraction of total orders -
    //      a full index on status would be wasteful (low cardinality).
    //      Partial index contains ONLY pending orders -> tiny, hot, fast.
    //      As orders are confirmed/completed, they leave this index automatically.
    // Query it serves: WHERE status = 'pending' ORDER BY created_at ASC
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pending
    ON orders(created_at ASC)
    WHERE status = 'pending'
  `);

    // Index on order_number for customer-facing lookups.
    // WHY: Customers look up orders by order number (ORD-YYYYMMDD-XXXXX).
    //      Already has UNIQUE constraint but we add partial for active orders.
    // Query it serves: WHERE order_number = $1
    await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_order_number
    ON orders(order_number)
    WHERE deleted_at IS NULL
  `);

    // ------------------------------------------------------------------------
    // ORDER ITEMS
    // ------------------------------------------------------------------------

    // Composite B-Tree index: (order_id, product_id).
    // WHY: The primary access pattern for order_items is always through order_id.
    //      "Get all items for order X" is called on every order detail page.
    //      Including product_id enables index-only scans when only these
    //      two columns are needed (e.g., checking if product is in order).
    // Column order: order_id first (equality filter always present),
    //               product_id second (sometimes filtered, enables covering).
    // Query it serves:
    //   WHERE order_id = $1
    //   WHERE order_id = $1 AND product_id = $2
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_order_product
    ON order_items(order_id, product_id)
  `);

    // Index on product_id for reverse lookups.
    // WHY: "Which orders contain product X?" - needed for:
    //      - Product deletion safety checks (are there active orders for this?)
    //      - Sales reports per product
    //      Without this: full scan of order_items for every product query.
    // Query it serves: WHERE product_id = $1
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_product
    ON order_items(product_id)
  `);

    // ------------------------------------------------------------------------
    // WALLET TRANSACTIONS
    // ------------------------------------------------------------------------

    // Index on wallet_id + created_at for transaction history.
    // WHY: "Show me all transactions for wallet X, newest first" -
    //      called on every wallet history page.
    //      created_at DESC gives natural chronological ordering.
    // Query it serves: WHERE wallet_id = $1 ORDER BY created_at DESC
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_wallet_created
    ON wallet_transactions(wallet_id, created_at DESC)
  `);

    // Index on order_id for order-linked transaction lookup.
    // WHY: "Show me the payment transaction for order X" -
    //      needed for refund processing and order detail pages.
    //      Partial: only rows with an order_id (excludes top-ups, adjustments).
    // Query it serves: WHERE order_id = $1
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_order
    ON wallet_transactions(order_id)
    WHERE order_id IS NOT NULL
  `);

    // ------------------------------------------------------------------------
    // AUDIT LOGS
    // ------------------------------------------------------------------------

    // Composite index: (entity_type, entity_id).
    // WHY: "Show me all audit events for order 42" or "for user 7."
    //      This is the primary audit log query - polymorphic lookup.
    //      entity_type first: narrows to one table's records.
    //      entity_id second: narrows to one specific record.
    //      Together they make targeted audit queries instant.
    // Query it serves: WHERE entity_type = $1 AND entity_id = $2
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity
    ON audit_logs(entity_type, entity_id)
  `);

    // Partial index on performed_by for user activity queries.
    // WHY: "Show me everything user X did" - security investigations, admin tools.
    //      Partial (performed_by IS NOT NULL) excludes system events -
    //      system events have no user and are never queried by user.
    //      Keeps index smaller and more selective.
    // Query it serves: WHERE performed_by = $1 ORDER BY created_at DESC
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_performer
    ON audit_logs(performed_by, created_at DESC)
    WHERE performed_by IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
    // Drop all indexes
    const indexes = [
        "idx_users_email",
        "idx_products_purchasable",
        "idx_products_name_active",
        "idx_orders_user_created",
        "idx_orders_pending",
        "idx_orders_order_number",
        "idx_order_items_order_product",
        "idx_order_items_product",
        "idx_wallet_transactions_wallet_created",
        "idx_wallet_transactions_order",
        "idx_audit_logs_entity",
        "idx_audit_logs_performer",
    ];

    for (const idx of indexes) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${idx}`);
    }
}
