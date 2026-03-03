import { AsyncLocalStorage } from "async_hooks";

//  Audit Context Store 
// Uses Node.js AsyncLocalStorage to carry request-scoped context
// through the entire async call chain without prop drilling.
//
// Flow:
//   1. HTTP middleware calls AuditContext.run({ userId, ip, userAgent }, fn)
//   2. Anywhere downstream: AuditContext.get() returns that same context
//   3. withAuditContext() reads it -> sets SET LOCAL vars -> trigger picks it up
//
// Why AsyncLocalStorage over passing context as parameters?
//   - Services don't need to know about audit context at all
//   - No extra parameters polluting every function signature
//   - Context flows automatically through awaited calls, Promise.all -
//     anything in the same async context tree
//
// Why not a global variable?
//   - Global state is shared across ALL concurrent requests
//   - Request A would overwrite Request B's context mid-flight
//   - AsyncLocalStorage isolates each request's context completely

export type AuditSource = "api" | "system";

export interface AuditContextData {
    userId: number | null; // who performed the action (null = system/cron)
    ip: string | null; // IPv4 or IPv6 from request
    userAgent: string | null; // browser/client identifier
    source: AuditSource; // 'api' = HTTP request | 'system' = cron/migration
}

// The singleton storage instance - one per application process.
// Each request gets its own isolated store slot automatically.
const storage = new AsyncLocalStorage<AuditContextData>();

export const AuditContext = {
    //  Run a function within an audit context 
    // Called by HTTP middleware for every incoming request.
    // Everything inside fn() and its async descendants can call AuditContext.get()
    run<T>(context: AuditContextData, fn: () => Promise<T>): Promise<T> {
        return storage.run(context, fn);
    },

    //  Get current context 
    // Returns null if called outside of a context - safe default applied
    // in withAuditContext() below.
    get(): AuditContextData | null {
        return storage.getStore() ?? null;
    },

    //  System context for cron jobs / internal processes 
    // Use this when running automated processes not tied to an HTTP request.
    // Trigger will see source='system', performed_by=NULL.
    runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
        return storage.run(
            { userId: null, ip: null, userAgent: null, source: "system" },
            fn,
        );
    },
};

//  Legacy helpers (backward compat with previous project) 
export const auditStorage = storage;

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

export function runWithAuditContext<T>(
    context: AuditContextData,
    fn: () => T,
): T {
    return storage.run(context, fn as () => Promise<T>) as unknown as T;
}
