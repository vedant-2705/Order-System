import type { Knex } from "knex";

//  Migration: Create audit_logs + add wallet_transactions order_id FK 
// Depends on: users, orders (both must exist)
//
// audit_logs is an append-only table - rows are never updated or deleted.
// It records every meaningful state change across the system.
//
// Also resolves the circular dependency from migration 004:
// wallet_transactions.order_id -> orders.id
// We couldn't add this FK in 004 because orders didn't exist yet.

export async function up(knex: Knex): Promise<void> {
    //  Resolve wallet_transactions.order_id FK 
    // Now that orders table exists, we can add the FK constraint.
    // onDelete SET NULL: if an order is deleted, the transaction record
    // remains but loses the order reference. Financial records must persist.
    await knex.raw(`
    ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_order_id_fk
    FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
  `);

    //  audit_logs 
    await knex.schema.createTable("audit_logs", (table) => {
        //  Primary Key 
        table.uuid("id").primary().defaultTo(knex.fn.uuid());

        //  Entity Reference 
        // Generic polymorphic reference - works for any table.
        // entity_type: 'users' | 'orders' | 'products' | 'wallet' | ...
        // entity_id: the PK of the affected row in that table
        // Why not a direct FK? Because audit_logs must survive even if the
        // referenced row is deleted. A FK would prevent that.
        table.string("entity_type", 100).notNullable();
        table.string("entity_id").notNullable();

        //  Action 
        table
            .enum("action", [
                "CREATE",
                "UPDATE",
                "DELETE",
                "LOGIN",
                "LOGOUT",
                "FAILED_LOGIN",
            ])
            .notNullable();

        //  State Snapshots 
        // JSONB: binary JSON - indexed, queryable, compressed.
        // Stores full row state before and after the change.
        // old_data is NULL for CREATE actions (nothing existed before).
        // new_data is NULL for DELETE actions (nothing exists after).
        table.jsonb("old_data").nullable();
        table.jsonb("new_data").nullable();

        //  Actor 
        // Nullable FK - system events (cron jobs, automated processes)
        // have no associated user.
        // NOT a hard FK - user may be deleted but log must be preserved.
        table.string("performed_by").nullable();

        //  Request Context 
        // Captured from HTTP request for security investigations.
        table.string("ip_address", 45).nullable(); // 45 chars supports IPv6
        table.string("user_agent", 500).nullable();

        //  Timestamp 
        // Only created_at - this is an immutable append-only log.
        // No updated_at, no deleted_at.
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("audit_logs");

    // Remove the FK we added to wallet_transactions
    await knex.raw(`
    ALTER TABLE wallet_transactions
    DROP CONSTRAINT IF EXISTS wallet_transactions_order_id_fk
  `);
}
