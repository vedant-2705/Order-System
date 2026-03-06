/**
 * @module sseRoutes
 * @description SSE endpoint for live order stats.
 *
 *   GET /api/v2/events/order-stats   (admin only)
 *
 * Flow:
 *   1. authMiddleware - validates JWT
 *   2. requireRole("admin") - non-admins get 403
 *   3. sseManager.addConnection(res) - registers the response, sets SSE headers,
 *      returns a connectionId
 *   4. Immediately pushes the current stats snapshot to the new client so they
 *      don't have to wait up to 5 seconds for the first broadcast tick
 *
 * The route handler never calls res.end() - the connection stays open until:
 *   - The client closes it (EventSource.close(), browser tab closed)
 *   - The server shuts down (sseManager.closeAll() in graceful shutdown)
 *   - A proxy timeout (prevented by 30s SSE heartbeat comments)
 *
 * ## Why /api/v2/?
 * SSE and WebSocket endpoints are a different transport layer from the REST
 * API. Versioning them separately keeps REST /v1 routes clean and allows the
 * real-time layer to evolve independently (e.g. switching to WS for a specific
 * event type without touching REST routes).
 */
import { Router } from "express";
import { authMiddleware } from "middleware/authMiddleware.js";
import { requireRole } from "middleware/requireRole.js";
import { sseManager } from "realtime/SSEManager.js";
import { resolve } from "config/di/container.js";
import { OrderStatsService } from "realtime/OrderStatsService.js";

const router = Router();

router.get(
    "/order-stats",
    authMiddleware,
    requireRole("admin"),
    async (req, res) => {
        // Register connection and set SSE headers - res stays open
        const connectionId = sseManager.addConnection(res);

        // Push an immediate snapshot so the client sees data right away,
        // not after waiting for the first 5-second broadcast tick
        try {
            const statsService = resolve(OrderStatsService);
            const stats = await statsService.getLiveStats();
            sseManager.sendToConnection(connectionId, "order-stats", stats);
        } catch (err) {
            // Non-fatal - the client will receive data on the next broadcast tick
            // Log and continue; don't close the connection over a single failed fetch
        }
    },
);

export default router;
