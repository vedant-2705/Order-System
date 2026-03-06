import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { logger } from "utils/logger.js";

/**
 * JWT payload shape - mirrors authMiddleware.
 * `sub` = user id, `role` = "customer" | "admin".
 */
interface JwtPayload {
    sub: string;
    role: string;
}

/**
 * Metadata attached to each authenticated WebSocket connection.
 *
 * userId  - resolved from JWT sub claim at handshake time
 * role    - "customer" | "admin"
 * room    - the room the client has joined (one room per connection)
 * isAlive - ping/pong liveness flag (false = connection considered dead)
 */
interface AuthenticatedSocket extends WebSocket {
    userId: string;
    role: string;
    room: string | null;
    isAlive: boolean;
}

/**
 * Union of all client-to-server message shapes.
 *
 * join    - join a named chat room (creates it if it doesn't exist)
 * leave   - leave the current room
 * message - send a text message to everyone in the current room
 */
type ClientMessage =
    | { type: "join"; room: string }
    | { type: "leave" }
    | { type: "message"; text: string };

/**
 * Union of all server-to-client message shapes.
 *
 * joined   - confirmation that the client has joined a room
 * left     - confirmation that the client has left a room
 * message  - a chat message from another user in the room
 * system   - server-generated notification (join/leave announcements)
 * error    - describes a client error (bad message, not in room, etc.)
 * pong     - acknowledgement of a client-initiated ping (optional)
 */
type ServerMessage =
    | { type: "joined"; room: string; memberCount: number }
    | { type: "left"; room: string }
    | {
          type: "message";
          room: string;
          userId: string;
          text: string;
          timestamp: string;
      }
    | { type: "system"; room: string; text: string }
    | { type: "error"; code: string; message: string }
    | { type: "pong" };

/**
 * Manages all WebSocket connections with JWT authentication, room-based chat,
 * ping/pong liveness detection, and graceful shutdown.
 *
 * ## Architecture
 *
 * Connections are stored in a `rooms` Map<roomName, Set<AuthenticatedSocket>>.
 * An unjoined client can still be connected but cannot send or receive messages
 * until they send a `join` frame.
 *
 * ## Authentication
 *
 * WS handshake auth is done at connection time via the URL query parameter:
 *   ws://localhost:3000/ws?token=<JWT>
 *
 * Why query param instead of an Authorization header?
 * The browser WebSocket API does not support custom headers on the initial
 * handshake request (it's a browser limitation, not a protocol one).
 * Alternatives: cookie (requires CSRF hardening), first-message auth
 * (requires holding messages until auth completes). Query param is the
 * most practical and widely-used approach for browser WS clients.
 *
 * The token is validated using the same jwt.verify() call as authMiddleware,
 * with the same JWT_SECRET env variable. Invalid/missing token -> socket closed
 * with code 4001 (custom close code in the app-defined range 4000–4999).
 *
 * ## Ping / Pong
 *
 * The WS `ping` frame is built into the protocol. When the server sends a ping,
 * the client's WS stack automatically replies with a pong frame without any
 * application code required. We listen for the pong and set `socket.isAlive = true`.
 *
 * Every 30 seconds, the liveness check:
 *   1. Terminates any socket where isAlive is still false (previous ping was not ponged)
 *   2. Resets all remaining sockets to isAlive = false
 *   3. Sends a ping to every remaining socket
 *
 * This detects dead TCP connections that haven't had a clean close event - common
 * behind NAT, load balancers, and mobile network switches. Without this, dead
 * sockets accumulate in the rooms Map indefinitely.
 *
 * ## Message routing
 *
 * All messages are JSON frames. The `type` field is the discriminant.
 * Unknown types -> error frame sent back. Non-JSON -> error frame + socket closed.
 *
 * ## Module-level singleton
 *
 * Same reasoning as SSEManager - wsManager holds live socket handles and must
 * be the same instance in both the route handler (attach) and app.ts (shutdown).
 */
export class WebSocketManager {
    /** roomName -> set of sockets currently in that room */
    private rooms: Map<string, Set<AuthenticatedSocket>> = new Map();

    /** All connected sockets, regardless of room membership */
    private allSockets: Set<AuthenticatedSocket> = new Set();

    private pingInterval: ReturnType<typeof setInterval> | null = null;

    /**
     * Attaches this manager to a WebSocketServer instance.
     * Sets up connection handling and starts the ping/pong liveness loop.
     * Called once from app.ts after httpServer.listen().
     */
    attach(wss: WebSocketServer): void {
        wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
            this.onConnection(ws as AuthenticatedSocket, req);
        });

        // Ping/pong liveness detection - every 30 seconds
        this.pingInterval = setInterval(() => this.checkLiveness(), 30_000);

        logger.info("[WS] WebSocketManager attached");
    }

    //  Connection lifecycle 

    private onConnection(
        socket: AuthenticatedSocket,
        req: IncomingMessage,
    ): void {
        //  Authenticate at handshake time 
        const url = new URL(req.url ?? "/", "ws://localhost");
        const token = url.searchParams.get("token");

        if (!token) {
            this.closeWithError(socket, 4001, "Missing authentication token");
            return;
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            this.closeWithError(socket, 4500, "Server misconfiguration");
            return;
        }

        let payload: JwtPayload;
        try {
            payload = jwt.verify(token, secret) as JwtPayload;
        } catch {
            this.closeWithError(socket, 4001, "Invalid or expired token");
            return;
        }

        // Attach identity to the socket - available on all subsequent message handlers
        socket.userId = payload.sub;
        socket.role = payload.role;
        socket.room = null;
        socket.isAlive = true;

        this.allSockets.add(socket);

        logger.debug("[WS] Client connected", {
            userId: socket.userId,
            role: socket.role,
            total: this.allSockets.size,
        });

        //  Wire up event handlers 
        socket.on("pong", () => {
            socket.isAlive = true;
        });

        socket.on("message", (data) => {
            this.onMessage(socket, data.toString());
        });

        socket.on("close", () => {
            this.onDisconnect(socket);
        });

        socket.on("error", (err) => {
            logger.warn("[WS] Socket error", {
                userId: socket.userId,
                error: err.message,
            });
        });
    }

    private onDisconnect(socket: AuthenticatedSocket): void {
        this.allSockets.delete(socket);

        if (socket.room) {
            this.leaveRoom(socket, socket.room);
        }

        logger.debug("[WS] Client disconnected", {
            userId: socket.userId,
            remaining: this.allSockets.size,
        });
    }

    //  Message handling 

    private onMessage(socket: AuthenticatedSocket, raw: string): void {
        let msg: ClientMessage;
        try {
            msg = JSON.parse(raw) as ClientMessage;
        } catch {
            this.send(socket, {
                type: "error",
                code: "INVALID_JSON",
                message: "Message must be a valid JSON object",
            });
            return;
        }

        switch (msg.type) {
            case "join":
                this.handleJoin(socket, msg.room);
                break;
            case "leave":
                this.handleLeave(socket);
                break;
            case "message":
                this.handleMessage(socket, msg.text);
                break;
            default:
                this.send(socket, {
                    type: "error",
                    code: "UNKNOWN_MESSAGE_TYPE",
                    message: `Unknown message type. Supported: join, leave, message`,
                });
        }
    }

    //  Message type handlers 

    private handleJoin(socket: AuthenticatedSocket, room: string): void {
        if (!room || typeof room !== "string" || room.trim().length === 0) {
            this.send(socket, {
                type: "error",
                code: "INVALID_ROOM",
                message: "Room name cannot be empty",
            });
            return;
        }

        const cleanRoom = room.trim();

        // Leave current room first if already in one
        if (socket.room && socket.room !== cleanRoom) {
            this.leaveRoom(socket, socket.room);
        }

        if (!this.rooms.has(cleanRoom)) {
            this.rooms.set(cleanRoom, new Set());
        }

        const roomMembers = this.rooms.get(cleanRoom)!;
        roomMembers.add(socket);
        socket.room = cleanRoom;

        // Confirm join to the requester
        this.send(socket, {
            type: "joined",
            room: cleanRoom,
            memberCount: roomMembers.size,
        });

        // Announce arrival to everyone else in the room
        this.broadcastToRoom(
            cleanRoom,
            {
                type: "system",
                room: cleanRoom,
                text: `User ${socket.userId} joined the room`,
            },
            socket,
        );

        logger.debug("[WS] User joined room", {
            userId: socket.userId,
            room: cleanRoom,
            members: roomMembers.size,
        });
    }

    private handleLeave(socket: AuthenticatedSocket): void {
        if (!socket.room) {
            this.send(socket, {
                type: "error",
                code: "NOT_IN_ROOM",
                message: "You are not in any room",
            });
            return;
        }
        this.leaveRoom(socket, socket.room);
    }

    private handleMessage(socket: AuthenticatedSocket, text: string): void {
        if (!socket.room) {
            this.send(socket, {
                type: "error",
                code: "NOT_IN_ROOM",
                message: "Join a room before sending messages",
            });
            return;
        }

        if (!text || typeof text !== "string" || text.trim().length === 0) {
            this.send(socket, {
                type: "error",
                code: "EMPTY_MESSAGE",
                message: "Message text cannot be empty",
            });
            return;
        }

        if (text.length > 2000) {
            this.send(socket, {
                type: "error",
                code: "MESSAGE_TOO_LONG",
                message: "Message cannot exceed 2000 characters",
            });
            return;
        }

        const outgoing: ServerMessage = {
            type: "message",
            room: socket.room,
            userId: socket.userId,
            text: text.trim(),
            timestamp: new Date().toISOString(),
        };

        // Broadcast to everyone in room including the sender -
        // sender gets echo confirmation, others receive the message.
        this.broadcastToRoom(socket.room, outgoing);
    }

    //  Room management 

    private leaveRoom(socket: AuthenticatedSocket, room: string): void {
        const roomMembers = this.rooms.get(room);
        if (!roomMembers) return;

        roomMembers.delete(socket);
        socket.room = null;

        // Clean up empty rooms - prevents unbounded Map growth
        if (roomMembers.size === 0) {
            this.rooms.delete(room);
        } else {
            // Announce departure to remaining members
            this.broadcastToRoom(room, {
                type: "system",
                room,
                text: `User ${socket.userId} left the room`,
            });
        }

        this.send(socket, { type: "left", room });

        logger.debug("[WS] User left room", {
            userId: socket.userId,
            room,
            remainingMembers: roomMembers.size,
        });
    }

    //  Send helpers 

    /**
     * Sends a typed ServerMessage to a single socket.
     * Silently drops if the socket is not in OPEN state.
     */
    private send(socket: AuthenticatedSocket, msg: ServerMessage): void {
        if (socket.readyState !== WebSocket.OPEN) return;
        try {
            socket.send(JSON.stringify(msg));
        } catch (err) {
            logger.warn("[WS] send() failed", {
                userId: socket.userId,
                error: (err as Error).message,
            });
        }
    }

    /**
     * Sends a message to all sockets in a room.
     * Pass `exclude` to skip a specific socket (e.g. don't echo join announcements
     * back to the socket that just joined - they already got the `joined` frame).
     */
    private broadcastToRoom(
        room: string,
        msg: ServerMessage,
        exclude?: AuthenticatedSocket,
    ): void {
        const members = this.rooms.get(room);
        if (!members) return;

        const payload = JSON.stringify(msg);

        for (const socket of members) {
            if (exclude && socket === exclude) continue;
            if (socket.readyState !== WebSocket.OPEN) continue;
            try {
                socket.send(payload);
            } catch {
                // Discovered dead socket - will be cleaned up by liveness check
            }
        }
    }

    private closeWithError(
        socket: WebSocket,
        code: number,
        reason: string,
    ): void {
        logger.warn("[WS] Closing connection", { code, reason });
        socket.close(code, reason);
    }

    //  Ping/pong liveness 

    /**
     * Terminates sockets that did not respond to the previous ping,
     * resets the liveness flag, then sends a fresh ping to all survivors.
     *
     * Runs every 30 seconds (started in attach()).
     */
    private checkLiveness(): void {
        const dead: AuthenticatedSocket[] = [];

        for (const socket of this.allSockets) {
            if (!socket.isAlive) {
                dead.push(socket);
                continue;
            }
            socket.isAlive = false;
            socket.ping();
        }

        for (const socket of dead) {
            logger.debug("[WS] Terminating unresponsive socket", {
                userId: socket.userId,
            });
            socket.terminate();
            // onDisconnect will fire via the 'close' event triggered by terminate()
        }
    }

    //  Graceful shutdown 

    /**
     * Closes all open connections with code 1001 (Going Away) and stops the
     * ping/pong timer. Called from app.ts shutdown() before process.exit().
     *
     * Code 1001 signals to clients that the server is shutting down intentionally -
     * well-implemented clients will attempt to reconnect after a brief delay.
     */
    shutdown(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        for (const socket of this.allSockets) {
            try {
                socket.close(1001, "Server shutting down");
            } catch {
                socket.terminate();
            }
        }

        this.allSockets.clear();
        this.rooms.clear();

        logger.info("[WS] All connections closed for shutdown");
    }

    /** Number of currently open WebSocket connections. */
    get connectionCount(): number {
        return this.allSockets.size;
    }

    /** Number of active named rooms. */
    get roomCount(): number {
        return this.rooms.size;
    }
}

// Module-level singleton - shared between app.ts (attach/shutdown) and any future
// use case that needs to push WS events to specific users.
export const wsManager = new WebSocketManager();
