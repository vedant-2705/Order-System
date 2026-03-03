import type { Knex } from "knex";

//  Migration: Create wallet table 
// Depends on: users
// One wallet per user - enforced by UNIQUE constraint on user_id.
// Balance is the current running total; wallet_transactions is the ledger.
// These two must always agree - balance = SUM of all transactions.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("wallet", (table) => {
        //  Primary Key 
        table.increments("id").primary();

        //  Foreign Key 
        // UNIQUE: one wallet per user, enforced at DB level.
        // onDelete RESTRICT: cannot delete a user who has a wallet.
        // Prevents orphaned wallets and accidental user deletion.
        table
            .integer("user_id")
            .unsigned()
            .notNullable()
            .unique()
            .references("id")
            .inTable("users")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");

        //  Balance 
        // DECIMAL(14,2): supports large balances up to 999,999,999,999.99
        // DEFAULT 0.00: new wallets start empty
        table.decimal("balance", 14, 2).notNullable().defaultTo(0.0);

        // ISO 4217 currency code - 3 chars (INR, USD, EUR)
        // Defaulting to INR per project context.
        // Adding now costs nothing; retrofitting later requires a migration + backfill.
        table.string("currency", 3).notNullable().defaultTo("INR");

        //  Timestamps 
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    });

    //  CHECK Constraint 
    // Balance cannot go below zero.
    // This fires AFTER the application's balance check - it's the safety net.
    // If a bug in application logic tries to deduct more than available,
    // this constraint throws an error and forces a rollback.
    await knex.raw(`
        ALTER TABLE wallet
        ADD CONSTRAINT wallet_balance_non_negative
        CHECK (balance >= 0)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("wallet");
}
