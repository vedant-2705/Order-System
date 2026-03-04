/**
 * @module audit/types
 * @description Domain types for the audit module.
 *
 * These types mirror the `audit_logs` table schema.  All rows in that
 * table are written by the PostgreSQL trigger  never by application code.
 */

/**
 * Subset of database actions captured by the audit trigger.
 * `LOGIN`, `LOGOUT`, and `FAILED_LOGIN` are synthetic actions recorded
 * by the application session layer (not the DB trigger).
 */
export type AuditAction =
    | "INSERT"
    | "UPDATE"
    | "DELETE"
    | "LOGIN"
    | "LOGOUT"
    | "FAILED_LOGIN";

/**
 * Origin of the change that produced an audit row.
 *
 * - `api`       change came through a normal API request.
 * - `admin_db`  change made directly in the database (psql/pgAdmin).
 * - `system`    internal automated process (migrations, seeds, cron jobs).
 */
export type AuditSource = "api" | "admin_db" | "system";

/** Database row shape for the `audit_logs` table. */
export interface AuditLog {
    id: string;
    entity_type: string;                        // table name, e.g. 'orders'
    entity_id: string;                          // primary key of the changed row
    action: AuditAction;
    old_data: Record<string, unknown> | null;   // pre-change snapshot (UPDATE/DELETE)
    new_data: Record<string, unknown> | null;   // post-change snapshot (INSERT/UPDATE)
    performed_by: string | null;                // null for unauthenticated / system ops
    ip_address: string | null;
    user_agent: string | null;
    source: AuditSource;
    created_at: Date;
}
