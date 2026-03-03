import type { Knex } from "knex";

//  Migration: Create users table 
// First migration - no dependencies on other tables.
// Includes soft delete (deleted_at) so user records are never hard-deleted.
// Audit trail and FK integrity require rows to persist.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("users", (table) => {
        //  Primary Key 
        table.increments("id").primary();

        //  Core Fields 
        table.string("name", 255).notNullable();

        // Unique enforced at DB level - prevents duplicate accounts.
        // Application layer should check first, but DB is the final guard.
        table.string("email", 255).notNullable().unique();

        table.string("password_hash", 255).notNullable();

        // Role drives authorization logic and audit log context.
        // 'customer' is the safe default - never accidentally grant admin.
        table
            .enum("role", ["customer", "admin"])
            .notNullable()
            .defaultTo("customer");

        //  Timestamps 
        // timestamps(useTimestamps, defaultToNow) -> created_at, updated_at
        table.timestamps(true, true);

        // Soft delete - null means active, timestamp means deleted.
        // Allows FK references to remain valid after "deletion".
        // Filter active users with: WHERE deleted_at IS NULL
        table.timestamp("deleted_at").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("users");
}
