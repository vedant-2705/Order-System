/**
 * @module auditContextMiddleware
 * @description Express middleware that seeds an `AuditContextData` store
 * into Node.js `AsyncLocalStorage` for the lifetime of each HTTP request.
 *
 * Must be registered **after** any authentication middleware (which sets
 * `req.user`) and **before** any route handlers.
 * 
 * What it does:
 *  1. Extracts userId from authenticated session (set by auth middleware)
 *  2. Extracts IP address from request (handles proxies correctly)
 *  3. Extracts User-Agent header
 *  4. Wraps the entire request in AuditContext.run()
 *     -> everything downstream in this request's async chain
 *     can call AuditContext.get() and get these values
 *
 * Correct registration order:
 * ```
 * app.use(authMiddleware)          // 1. sets req.user
 * app.use(auditContextMiddleware)  // 2. reads req.user.id
 * app.use(router)                  // 3. handlers call AuditContext.get()
 * ```
 *
 * @see utils/audit/auditContext.ts
 */
import { Request, Response, NextFunction } from "express";
import { AuditContext } from "../utils/audit/auditContext.js";

/**
 * Extracts audit metadata from the request and wraps the entire
 * Express handler chain in an `AsyncLocalStorage` context.
 *
 * @remarks
 * `next()` is called **inside** `AuditContext.run()` so that the async
 * context remains alive for the full request lifecycle  including any
 * database writes triggered by route handlers.
 *
 * The promise resolves when the response emits `finish` or `close`,
 * ensuring the context is not garbage-collected before the last query
 * completes.
 *
 * IP resolution priority (most-to-least specific):
 *   1. `x-forwarded-for` first value (set by Nginx / AWS ALB)
 *   2. `x-real-ip` (set by some reverse proxies)
 *   3. `req.ip`   (Express built-in, respects `trust proxy`)
 */
export function auditContextMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    //  Extract userId 
    // Assumes auth middleware has already run and set req.user.
    // If unauthenticated request (login, public routes) -> null.
    const userId = (req as any).user?.id ?? null;

    //  Extract IP address 
    // x-forwarded-for: set by load balancers/proxies (Nginx, AWS ALB)
    //   Format: "client_ip, proxy1_ip, proxy2_ip" -> take the first one
    // x-real-ip: set by some proxies as a single IP
    // req.ip: Express's built-in, respects trust proxy setting
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (
        (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ??
        (req.headers["x-real-ip"] as string) ??
        req.ip ??
        null
    )?.trim();

    //  Extract User-Agent 
    const userAgent = req.headers["user-agent"] ?? null;

    //  Wrap request in audit context 
    // AuditContext.run() creates an async context for this specific request.
    // All async operations that originate from this request -
    // even if they go through multiple service/repo layers -
    // will be able to call AuditContext.get() and receive THIS context.
    //
    // next() is called INSIDE run() so the entire Express handler chain
    // executes within the audit context.
    AuditContext.run(
        { userId, ip: ip ?? null, userAgent: userAgent ?? null, source: "api" },
        () =>
            new Promise<void>((resolve) => {
                // Call next() to pass control to the next middleware/route handler.
                // We resolve the promise when the response finishes -
                // this keeps the async context alive for the entire request lifecycle.
                res.on("finish", resolve);
                res.on("close", resolve);
                next();
            }),
    ).catch((err) => {
        // If something goes wrong in the context setup itself
        next(err);
    });
}
