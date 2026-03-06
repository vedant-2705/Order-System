import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { createHash } from "crypto";
import { RedisConnection, REDIS_CONNECTION } from "cache/RedisConnection.js";
import { logger } from "utils/logger.js";

/**
 * The full shape stored in Redis for each idempotency key.
 *
 * Fields beyond statusCode + body:
 *   cachedAt    - Unix ms timestamp of when the response was first stored.
 *                 Useful for TTL auditing: "this key was first seen 18h ago,
 *                 expires in 6h". Also exposed in logs for debugging replay storms.
 *
 *   requestHash - SHA-256 of the original request body (hex string).
 *                 Lets us detect body mismatches:
 *                   POST /orders  Key: abc  Body: { qty: 2 }  <- stored
 *                   POST /orders  Key: abc  Body: { qty: 5 }  <- MISMATCH -> 422
 *                 Without this, a client bug that sends a different body with
 *                 the same key would silently receive the first response,
 *                 creating a hard-to-debug "why did my order have wrong qty?" issue.
 *                 The field is optional so older entries stored before this
 *                 field was added still replay successfully (no hash = skip check).
 */
export interface CachedIdempotencyResponse {
    statusCode: number; // original HTTP status (201, 200, 422, etc.)
    body: unknown; // exact JSON body that was sent to the client
    cachedAt: number; // Unix ms timestamp - when this entry was first stored
    requestHash?: string; // optional SHA-256 hex of original request body
}

@singleton()
export class IdempotencyService {
    private readonly redis;
    private readonly TTL_SECONDS = 86_400; // 24 hours

    constructor(
        @inject(REDIS_CONNECTION)
        private readonly redisConnection: RedisConnection,
    ) {
        this.redis = redisConnection.getClient();
    }

    /**
     * Builds a SHA-256 hex digest of the serialised request body.
     *
     * Why SHA-256 over a simpler hash?
     *   - Collision-resistant enough that accidental matches are impossible
     *   - Deterministic: same body always produces same hash
     *   - Fast: hashing a typical order body (<1 KB) takes <0.1 ms
     *
     * We hash the JSON string (not the object) so key ordering in the body
     * matters. Clients sending { a:1, b:2 } vs { b:2, a:1 } with the same
     * idempotency key will be flagged as a mismatch - intentional, because
     * different serialisations may indicate different client behaviour.
     */
    hashBody(body: unknown): string {
        return createHash("sha256").update(JSON.stringify(body)).digest("hex");
    }

    private buildKey(userId: string, key: string): string {
        return `idempotency:${userId}:${key}`;
    }

    /**
     * Retrieves a previously stored idempotency response.
     * Returns null on cache miss OR on Redis error (fail open).
     */
    async get(
        userId: string,
        key: string,
    ): Promise<CachedIdempotencyResponse | null> {
        try {
            const stored = await this.redis.get(this.buildKey(userId, key));
            if (!stored) return null;
            return JSON.parse(stored) as CachedIdempotencyResponse;
        } catch (err) {
            logger.error("[Idempotency] GET failed", {
                error: (err as Error).message,
            });
            return null; // fail open - let request proceed rather than blocking it
        }
    }

    /**
     * Stores a response under the idempotency key.
     * Stamps cachedAt with the current Unix ms timestamp.
     * TTL is 24 hours - sufficient for any reasonable retry window.
     */
    async store(
        userId: string,
        key: string,
        response: Omit<CachedIdempotencyResponse, "cachedAt">,
    ): Promise<void> {
        try {
            const payload: CachedIdempotencyResponse = {
                ...response,
                cachedAt: Date.now(),
            };
            await this.redis.setex(
                this.buildKey(userId, key),
                this.TTL_SECONDS,
                JSON.stringify(payload),
            );
        } catch (err) {
            logger.error("[Idempotency] STORE failed", {
                error: (err as Error).message,
            });
            // Fail silently - a failed store means the next identical request
            // will re-process rather than replay, which is safe (idempotent operations).
        }
    }

    /**
     * Acquires a distributed processing lock using SET NX (atomic).
     *
     * Purpose: prevent two concurrent requests with the same idempotency key
     * from both passing the "no stored response" check and both executing
     * the order creation logic in parallel.
     *
     * TTL of 30s auto-expires the lock in case the server crashes mid-processing,
     * so the key is never permanently stuck in a locked state.
     *
     * Returns true if the lock was acquired (caller should proceed).
     * Returns false if another request already holds the lock (caller should 409).
     * Returns true on Redis error (fail open - better to allow duplicate processing
     * than to permanently block a user).
     */
    async acquireLock(userId: string, key: string): Promise<boolean> {
        try {
            const lockKey = `idempotency:lock:${userId}:${key}`;
            const result = await this.redis.set(lockKey, "1", "EX", 30, "NX");
            return result === "OK";
        } catch {
            return true; // fail open
        }
    }

    async releaseLock(userId: string, key: string): Promise<void> {
        try {
            await this.redis.del(`idempotency:lock:${userId}:${key}`);
        } catch {
            // TTL will expire it automatically - no action needed
        }
    }
}
