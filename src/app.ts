import "reflect-metadata"; // MUST be first import  tsyringe requires this
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

//  Routes (wired as we build each feature) 
// app.use('/api/orders',   orderRoutes);
// app.use('/api/wallet',   walletRoutes);
// app.use('/api/products', productRoutes);

//  Graceful Shutdown 
async function shutdown(): Promise<void> {
    logger.info("Shutting down...");
    const db = resolve(DatabaseProvider);
    await db.destroy(); // drain pool before exit
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

//  Start 
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
