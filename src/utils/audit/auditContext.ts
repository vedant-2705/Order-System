/**
 * @module auditContext
 * @description Request-scoped audit context powered by Node.js `AsyncLocalStorage`.
 *
 * Carries `{ userId, ip, userAgent, source }` through the entire async call
 * chain of a single HTTP request without prop-drilling.
 *
 * Why `AsyncLocalStorage` and not a global variable?
 *   - Global state is shared across ALL concurrent requests.
 *     Request A would silently overwrite Request B's context mid-flight.
 *   - `AsyncLocalStorage` creates an isolated store slot per async context
 *     tree, so each request sees only its own data.
 *
 * Why not pass context as function parameters?
 *   - Every service, repository, and helper would need an extra parameter.
 *   - Context flows automatically through `await`, `Promise.all`, etc.,
 *     without any coupling between layers.
 *
 * Flow:
 *   1. `auditContextMiddleware` calls `AuditContext.run()` wrapping the request
 *   2. Any downstream code calls `AuditContext.get()` to read the context
 *   3. `withAuditContext()` reads it and stamps `SET LOCAL` session variables
 *   4. The PostgreSQL audit trigger reads those variables when it fires
 */
import { AsyncLocalStorage } from "async_hooks";


/** Identifies whether the action originated from an HTTP request or an internal system process. */
export type AuditSource = "api" | "system";

/**
 * Data carried through the async context for the duration of one request.
 * All fields are nullable to support unauthenticated and system-originated calls.
 */
export interface AuditContextData {
    userId: number | null;     // who performed the action (null = system/cron)
    ip: string | null;         // IPv4 or IPv6 address from the request
    userAgent: string | null;  // browser or API client identifier
    source: AuditSource;       // 'api' = HTTP request | 'system' = cron/migration
}

// One singleton storage instance per process.
// Each request gets its own isolated store slot automatically via AsyncLocalStorage.
const storage = new AsyncLocalStorage<AuditContextData>();

/**
 * Namespace that provides run/get/runAsSystem helpers for the audit context store.
 */
export const AuditContext = {
    /**
     * Runs `fn` inside a new audit context.
     *
     * @remarks
     * Called once per HTTP request by `auditContextMiddleware`.
     * Every `await`-ed call inside `fn` can retrieve the context via `AuditContext.get()`.
     *
     * @param context - The audit metadata extracted from the request.
     * @param fn      - The async function to run within the context.
     * @returns The resolved value of `fn`.
     */
    run<T>(context: AuditContextData, fn: () => Promise<T>): Promise<T> {
        return storage.run(context, fn);
    },

    /**
     * Retrieves the current request's audit context.
     *
     * @returns The context object, or `null` if called outside a context
     *          (e.g. from a CLI script or test without middleware).
     */
    get(): AuditContextData | null {
        return storage.getStore() ?? null;
    },

    /**
     * Runs `fn` under a system-origin audit context.
     *
     * @remarks
     * Use this for cron jobs, migrations, and any automated process not
     * tied to an HTTP request.  The audit trigger will record
     * `source='system'` and `performed_by=NULL`.
     *
     * @param fn - The async function to run as the system actor.
     * @returns The resolved value of `fn`.
     */
    runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
        return storage.run(
            { userId: null, ip: null, userAgent: null, source: "system" },
            fn,
        );
    },
};

// ---------------------------------------------------------------------------
// Legacy helpers retained for backward compatibility.
// Prefer using the `AuditContext` namespace object in new code.
// ---------------------------------------------------------------------------

/** Direct reference to the underlying AsyncLocalStorage instance. */
export const auditStorage = storage;

/**
 * Returns the current audit context, defaulting to system values if none is set.
 *
 * @deprecated Prefer `AuditContext.get()` and handle `null` explicitly.
 * @returns The current context or a system-level fallback.
 */
export function getAuditContext(): AuditContextData {
    return (
        storage.getStore() ?? {
            userId: null,
            ip: null,
            userAgent: null,
            source: "system",
        }
    );
}

/**
 * Synchronous wrapper around `AsyncLocalStorage.run()`.
 *
 * @deprecated Prefer `AuditContext.run()` with an async callback.
 */
export function runWithAuditContext<T>(
    context: AuditContextData,
    fn: () => T,
): T {
    return storage.run(context, fn as () => Promise<T>) as unknown as T;
}
