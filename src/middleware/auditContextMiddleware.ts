import { Request, Response, NextFunction } from "express";
import { AuditContext } from "../utils/audit/auditContext.js";

//  Audit Context Middleware 
// Runs on every HTTP request - MUST be registered before any routes.
//
// What it does:
//   1. Extracts userId from authenticated session (set by auth middleware)
//   2. Extracts IP address from request (handles proxies correctly)
//   3. Extracts User-Agent header
//   4. Wraps the entire request in AuditContext.run()
//      -> everything downstream in this request's async chain
//        can call AuditContext.get() and get these values
//
// Registration order in Express matters:
//   app.use(authMiddleware)       <- sets req.user first
//   app.use(auditContextMiddleware) <- reads req.user.id
//   app.use(router)               <- handlers can use AuditContext.get()

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
