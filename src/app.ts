/**
 * @module app
 * @description Express application entry point.
 *
 * Responsibilities:
 *   - Bootstraps the DI container (must happen before any resolution)
 *   - Mounts core middleware: JSON body parsing, audit context
 *   - Registers the /health endpoint for load-balancer probes
 *   - Manages graceful shutdown on SIGTERM / SIGINT
 *   - Defers route registration until feature modules are built
 *
 * Startup sequence:
 *   1. registerDependencies()  -> all singletons registered
 *   2. db.ping()               -> verify DB is reachable
 *   3. app.listen()            -> begin accepting traffic
 */
import "reflect-metadata"; // MUST be first import - tsyringe requires this
import "dotenv/config";
import express from "express";
import { registerDependencies, resolve } from "config/di/container.js";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { auditContextMiddleware } from "middleware/auditContextMiddleware.js";
import { logger } from "utils/logger.js";

//  Bootstrap DI 
// Must happen before any container.resolve() calls.
// All @singleton() instances are created lazily on first resolution 
// but registration must happen before that.
registerDependencies();

const app = express();
const PORT = process.env.PORT || 3000;

//  Core Middleware 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//  Audit Context Middleware 
// Wraps every request in AsyncLocalStorage context.
// Order: auth middleware -> auditContextMiddleware -> routes
app.use(auditContextMiddleware);

//  Health Check 
app.get("/health", async (_req, res) => {
    try {
        const db = resolve(DatabaseProvider);
        await db.ping();
        res.json({ status: "ok", pool: db.getPoolStats() });
    } catch {
        res.status(503).json({ status: "error" });
    }
});

/**
 * Gracefully shuts down the server.
 *
 * @remarks
 * Called on SIGTERM (container orchestrator) and SIGINT (Ctrl+C).
 * Drains the connection pool before exiting so in-flight queries
 * are not cut off mid-execution.
 */
async function shutdown(): Promise<void> {
    logger.info("Shutting down...");
    const db = resolve(DatabaseProvider);
    await db.destroy(); // drain pool before exit
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/**
 * Starts the HTTP server.
 *
 * @remarks
 * Pings the database before calling `app.listen()` so the process
 * never starts accepting traffic when the DB is unreachable.
 * Any startup error causes an immediate `process.exit(1)`.
 */
async function start(): Promise<void> {
    const db = resolve(DatabaseProvider);
    await db.ping(); // verify DB reachable before accepting traffic
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });
}

start().catch((err) => {
    logger.error("Failed to start server", { error: err });
    process.exit(1);
});

export default app;
