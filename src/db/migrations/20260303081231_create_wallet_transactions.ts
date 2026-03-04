import type { Knex } from "knex";

//  Migration: Create wallet_transactions table 
// Depends on: wallet, orders (orders table created in 005 - so we add the
// order_id FK in a later migration to avoid circular dependency)
//
// This is the immutable financial ledger.
// Every balance change - debit, credit, refund - is recorded here.
// The wallet.balance is a cache of the running total.
// These two must always agree:
//   wallet.balance = SUM(amount) WHERE type=credit - SUM(amount) WHERE type=debit
//
// NEVER UPDATE OR DELETE rows in this table.
// If a refund happens, INSERT a new 'credit' row - don't modify the debit.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("wallet_transactions", (table) => {
        //  Primary Key 
        table.uuid("id").primary().defaultTo(knex.fn.uuid());

        //  Foreign Keys 
        table
            .uuid("wallet_id")
            .notNullable()
            .references("id")
            .inTable("wallet")
            .onDelete("RESTRICT") // Never delete a wallet with transactions
            .onUpdate("CASCADE");

        // order_id is nullable: credits (top-ups) have no associated order.
        // Linked after orders table is created in migration 007.
        table.uuid("order_id").nullable();

        //  Transaction Details 
        // type: what kind of movement this is.
        // 'debit'      - money deducted (order payment)
        // 'credit'     - money added (top-up, refund)
        // 'refund'     - explicit refund (creates a credit, links to original order)
        // 'adjustment' - manual correction by admin
        table
            .enum("transaction_type", [
                "debit",
                "credit",
                "refund",
                "adjustment",
            ])
            .notNullable();

        // Amount is ALWAYS positive. Direction is conveyed by transaction_type.
        // Never store negative amounts - it creates ambiguity.
        table.decimal("amount", 14, 2).notNullable();

        // Snapshots of balance before and after this transaction.
        // Critical for: auditing, debugging, reconciliation.
        // If wallet.balance doesn't match balance_after of the latest transaction
        // -> data integrity issue that needs investigation.
        table.decimal("balance_before", 14, 2).notNullable();
        table.decimal("balance_after", 14, 2).notNullable();

        // Human-readable description: "Payment for order ORD-20240101-00042"
        table.string("description", 500).nullable();

        //  Timestamp 
        // Only created_at - this table is append-only, rows are never updated.
        table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    });

    //  CHECK Constraints 
    await knex.raw(`
    ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_amount_positive
    CHECK (amount > 0)
  `);

    await knex.raw(`
    ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_balance_before_non_negative
    CHECK (balance_before >= 0)
  `);

    await knex.raw(`
    ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_balance_after_non_negative
    CHECK (balance_after >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("wallet_transactions");
}
