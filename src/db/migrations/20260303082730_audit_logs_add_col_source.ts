import type { Knex } from "knex";

//  Migration: Add source column to audit_logs 
// Distinguishes HOW a change reached the DB:
//   'api'       - normal HTTP request through the Express app
//   'admin_db'  - direct DB access (psql, pgAdmin, DBeaver) - no app context set
//   'system'    - migration, cron job, seed, automated internal process
//
// How the trigger tells them apart:
//   app.current_source SET explicitly -> use that value
//   app.current_source NOT set        -> 'admin_db' (bypassed the app entirely)
//
// This makes direct DB changes by engineers fully visible and distinguishable
// from normal application traffic in the audit trail.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("audit_logs", (table) => {
        table
            .enum("source", ["api", "admin_db", "system"])
            .notNullable()
            .defaultTo("api")
            .after("user_agent");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("audit_logs", (table) => {
        table.dropColumn("source");
    });
}
