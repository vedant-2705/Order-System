import { Response } from "express";
import { logger } from "utils/logger.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Manages all open Server-Sent Events connections.
 *
 * Responsibilities:
 *   - Register / deregister client connections
 *   - Broadcast events to all connected clients
 *   - Send targeted events to a single connection
 *   - Send periodic heartbeats to keep connections alive through
 *     load balancers and proxies that close idle TCP connections
 *
 * ## Why a module-level singleton (not DI)?
 *
 * SSEManager holds live HTTP response objects - open socket handles.
 * It must be the same instance shared between:
 *   1. The SSE route handler  (calls addConnection)
 *   2. The broadcast loop in app.ts  (calls broadcast)
 *
 * tsyringe singletons would work, but exporting a module-level `sseManager`
 * constant is simpler and avoids the overhead of container resolution on
 * every broadcast tick (every 5 seconds). The tradeoff is intentional.
 *
 * ## SSE wire format (per spec)
 *
 *   event: <eventName>\n
 *   data: <JSON string>\n
 *   \n
 *
 * The double newline terminates the event. The browser EventSource API
 * parses this automatically - no client-side parsing needed.
 *
 * ## Heartbeat
 *
 * SSE comments (lines starting with `:`) are valid per spec and ignored by
 * the browser EventSource API. We use `: heartbeat\n\n` every 30 seconds to:
 *   - Keep the TCP connection alive through Nginx (default keepalive_timeout: 75s)
 *   - Keep the connection alive through AWS ALB (idle timeout: 60s by default)
 *   - Allow the server to detect dead connections quickly (write failure → remove)
 *
 * The X-Accel-Buffering: no header is critical for Nginx - without it, Nginx
 * buffers the entire response body before forwarding, which means SSE events
 * are never delivered until the connection closes.
 */
export class SSEManager {
    private connections: Map<string, Response> = new Map();
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Start heartbeat immediately - any connection added before the first
        // 30s tick will benefit from it on the next cycle.
        this.heartbeatInterval = setInterval(
            () => this.sendHeartbeat(),
            30_000,
        );
    }

    /**
     * Registers a new SSE client connection.
     *
     * Sets all required SSE headers and flushes them immediately so the
     * browser knows to keep the connection open before any event data arrives.
     *
     * Registers a `close` listener on the response so the connection is
     * automatically removed when the client disconnects (browser tab closed,
     * network drop, explicit `EventSource.close()` call).
     *
     * @param res - The Express response object for the SSE request.
     *              Must not have had res.end() called yet.
     * @returns The connectionId assigned to this client - use with sendToConnection().
     */
    addConnection(res: Response): string {
        const connectionId = uuidv4();

        // Required SSE response headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
        res.setHeader("Connection", "keep-alive");
        // Critical: disables Nginx proxy buffering so events are forwarded immediately.
        // Without this, Nginx buffers the entire response body before forwarding -
        // SSE events would be held until the connection closes, defeating the purpose.
        res.setHeader("X-Accel-Buffering", "no");

        // Flush headers to the client immediately.
        // This establishes the SSE stream before any event data is written.
        // Without this, the browser doesn't know the connection is open yet.
        res.flushHeaders();

        this.connections.set(connectionId, res);
        logger.debug("[SSE] Client connected", {
            connectionId,
            total: this.connections.size,
        });

        // Auto-remove on disconnect - covers browser tab close, network drop,
        // explicit EventSource.close(), and proxy timeout.
        res.on("close", () => {
            this.connections.delete(connectionId);
            logger.debug("[SSE] Client disconnected", {
                connectionId,
                remaining: this.connections.size,
            });
        });

        return connectionId;
    }

    /**
     * Broadcasts an SSE event to ALL connected clients.
     *
     * Dead connections (write failures) are collected and removed after
     * the loop completes - mutating the Map mid-iteration is unsafe.
     *
     * @param eventName - The SSE event name (client listens with `es.addEventListener(eventName, ...)`)
     * @param data      - The event payload - will be JSON-serialised.
     */
    broadcast(eventName: string, data: object): void {
        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        const dead: string[] = [];

        for (const [id, res] of this.connections) {
            try {
                res.write(payload);
            } catch {
                // Connection is dead - collect for removal after loop
                dead.push(id);
            }
        }

        // Clean up dead connections discovered during broadcast
        if (dead.length > 0) {
            dead.forEach((id) => this.connections.delete(id));
            logger.debug("[SSE] Removed dead connections during broadcast", {
                removed: dead.length,
                remaining: this.connections.size,
            });
        }
    }

    /**
     * Sends an SSE event to a single specific connection.
     *
     * Used for the initial stats push immediately after a client connects -
     * we don't want them waiting up to 5 seconds for the first broadcast tick.
     *
     * @param connectionId - ID returned by addConnection().
     * @param eventName    - The SSE event name.
     * @param data         - The event payload.
     */
    sendToConnection(
        connectionId: string,
        eventName: string,
        data: object,
    ): void {
        const res = this.connections.get(connectionId);
        if (!res) return;

        try {
            res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
            // Connection died between addConnection and this call
            this.connections.delete(connectionId);
            logger.debug("[SSE] sendToConnection - removed dead connection", {
                connectionId,
            });
        }
    }

    /**
     * Sends a keep-alive heartbeat comment to all connections.
     *
     * SSE comment syntax: `: <text>\n\n`
     * Comments are valid per the SSE spec and silently ignored by EventSource.
     * They serve purely as TCP keep-alives.
     *
     * Dead connections discovered here are cleaned up immediately.
     */
    private sendHeartbeat(): void {
        const dead: string[] = [];

        for (const [id, res] of this.connections) {
            try {
                res.write(": heartbeat\n\n");
            } catch {
                dead.push(id);
            }
        }

        if (dead.length > 0) {
            dead.forEach((id) => this.connections.delete(id));
            logger.debug("[SSE] Removed dead connections during heartbeat", {
                removed: dead.length,
                remaining: this.connections.size,
            });
        }
    }

    /**
     * Gracefully closes all open SSE connections and stops the heartbeat timer.
     * Called during server shutdown to prevent clients from hanging on a dead stream.
     */
    closeAll(): void {
        for (const res of this.connections.values()) {
            try {
                res.end();
            } catch {
                // Already closed - ignore
            }
        }
        this.connections.clear();

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        logger.info("[SSE] All connections closed");
    }

    /** Number of currently active SSE connections. */
    get connectionCount(): number {
        return this.connections.size;
    }
}

// Module-level singleton - shared between route handler and app.ts broadcast loop.
// See class-level comment for why this isn't DI-managed.
export const sseManager = new SSEManager();
