/**
 * @module WithAuditContext
 * @description Transaction wrapper that stamps PostgreSQL session variables
 * so the audit trigger can record who initiated each database write.
 *
 * `withAuditContext` is the **single entry point for all database transactions**
 * in this application.  Calling code never opens a raw `knex.transaction()`.
 *
 * How it works:
 *   1. Opens a Knex transaction.
 *   2. Reads `{ userId, ip, userAgent, source }` from `AsyncLocalStorage`.
 *   3. Calls `set_config(name, value, is_local=true)` for each field.
 *      - `is_local = true` -> identical to `SET LOCAL`: variables are scoped to
 *        this transaction only and automatically cleared on COMMIT / ROLLBACK.
 *      - Uses a single batched `SELECT set_config(...), set_config(...)` to
 *        avoid the extra round-trips that individual `SET LOCAL` statements
 *        would require.
 *   4. Invokes the caller's callback with the transaction object.
 *   5. Commits on success; rolls back (and re-throws) on error.
 *
 * Why `SET LOCAL` and not `SET`?
 *   `SET` persists for the entire session (connection lifetime).  In a
 *   connection pool a connection is reused across requests, so `SET` would
 *   leak context from Request A into Request B.  `SET LOCAL` clears itself
 *   automatically on transaction end  safe with pooling.
 *
 * @see utils/audit/auditContext.ts  for the AsyncLocalStorage setup
 * @see db/migrations/20260303082814_create_audit_trigger.ts  for the trigger
 */
import { Knex } from "knex";
import { AuditContext } from "./auditContext.js";
import { logger } from "../logger.js";

//  withAuditContext 
// The single entry point for ALL database transactions in this application.
//
// What it does:
//   1. Starts a Knex transaction
//   2. Reads current audit context from AsyncLocalStorage
//   3. Sets PostgreSQL session variables via SET LOCAL
//      -> these are scoped to THIS transaction only (cleared on commit/rollback)
//      -> the audit trigger reads these variables when it fires
//   4. Runs your callback with the transaction object
//   5. Commits on success, rolls back on error
//
// Why SET LOCAL and not SET?
//   SET          -> persists for the entire session (connection lifetime)
//                  In a connection pool, this leaks into the next request
//                  that reuses the same connection. DANGEROUS.
//   SET LOCAL    -> scoped to the current transaction only.
//                  Automatically cleared on COMMIT or ROLLBACK.
//                  Safe with connection pooling.
//
// Usage:
//   // In a service - no audit context parameters needed:
//   const order = await withAuditContext(db, async (trx) => {
//     const [order] = await trx('orders').insert(data).returning('*');
//     await trx('wallet').where({ user_id }).update({ balance });
//     return order;
//     // trigger fired on both writes, audit_logs populated automatically
//   });

/**
 * Wraps an async callback in a Knex transaction pre-configured with
 * per-transaction audit session variables.
 *
 * @param db - The Knex instance from `DatabaseProvider.getClient`.
 * @param fn - The async callback that receives the transaction client.
 *             Any INSERT / UPDATE / DELETE inside `fn` will cause
 *             the audit trigger to fire and write to `audit_logs`.
 * @returns The value returned by `fn`.
 * @throws Re-throws any error from `fn` after rolling back the transaction.
 *
 * @example
 * const order = await withAuditContext(db, async (trx) => {
 *   const [order] = await trx('orders').insert(data).returning('*');
 *   await trx('wallet').where({ user_id }).update({ balance });
 *   return order; // trigger fired on both writes, audit_logs populated
 * });
 */
export async function withAuditContext<T>(
    db: Knex,
    fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
    const ctx = AuditContext.get();

    //  Resolve context values 
    // If no AsyncLocalStorage context exists (called outside middleware -
    // e.g. from a cron job or seed file), default to system values.
    const userId = ctx?.userId ?? null;
    const ip = ctx?.ip ?? null;
    const userAgent = ctx?.userAgent ?? null;
    const source = ctx?.source ?? "system";

    return db.transaction(async (trx) => {
        //  Set session variables for this transaction 
        // These are read by audit_log_trigger() when it fires.
        // SET LOCAL means they exist ONLY for the duration of this transaction.
        // On COMMIT or ROLLBACK they are automatically cleared.
        //
        // We always set all variables - even if null - so the trigger
        // consistently sees either a value or an empty string (not an error).
        await trx.raw(
            `
      SELECT
        set_config('app.current_user_id',    ?, true),
        set_config('app.current_ip',         ?, true),
        set_config('app.current_user_agent', ?, true),
        set_config('app.current_source',     ?, true)
    `,
            [
                userId !== null ? String(userId) : "",
                ip ?? "",
                userAgent ?? "",
                source,
            ],
        );

        // Note: we use set_config(name, value, is_local) instead of SET LOCAL
        // because set_config() works in a regular SELECT - it can be batched
        // into a single round trip. SET LOCAL requires its own statement.
        // is_local=true -> same as SET LOCAL (transaction-scoped)

        logger.debug("[AUDIT] Transaction context set", {
            userId,
            ip,
            source,
            hasUserAgent: !!userAgent,
        });

        //  Run the actual business logic 
        // Any INSERT/UPDATE/DELETE inside fn() will fire the audit trigger,
        // which will read the session variables we just set.
        return fn(trx);

        // Knex automatically COMMITs if fn() resolves,
        // and ROLLBACKs if fn() throws.
        // On ROLLBACK: the audit_logs inserts also roll back - consistency guaranteed.
    });
}

/**
 * Convenience wrapper for system-originated operations (cron jobs, seeds, scripts).
 *
 * @remarks
 * Explicitly marks `source = 'system'` and `performed_by = NULL` in audit logs.
 * Equivalent to: `AuditContext.runAsSystem(() => withAuditContext(db, fn))`.
 *
 * @param db - The Knex instance from `DatabaseProvider.getClient`.
 * @param fn - The async callback that receives the transaction client.
 * @returns The value returned by `fn`.
 *
 * @example
 * await withSystemContext(db, async (trx) => {
 *   await trx('products').update({ stock: 0 }).where({ expired: true });
 * });
 */
export async function withSystemContext<T>(
    db: Knex,
    fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
    return AuditContext.runAsSystem(() => withAuditContext(db, fn));
}
