import { Request, Response, NextFunction, RequestHandler } from "express";
import { resolve } from "config/di/container.js";
import { IdempotencyService } from "lib/idempotency/IdempotencyService.js";
import { StatusCodes } from "http-status-codes";
import { logger } from "utils/logger.js";

/**
 * Idempotency middleware for POST /orders.
 *
 * MUST run AFTER authMiddleware - requires req.user.id to scope keys per user.
 * MUST run BEFORE the controller - intercepts and replays stored responses.
 *
 * Flow:
 *
 *   1. No Idempotency-Key header -> pass through (key is optional; absence
 *      means the client accepts non-idempotent behaviour).
 *
 *   2. Key present -> compute SHA-256 of req.body to detect body mismatches.
 *
 *   3. Stored response exists:
 *        a. requestHash matches (or stored entry has no hash) -> replay
 *        b. requestHash MISMATCH -> 422 Unprocessable Entity
 *           (same key + different body = client bug, not a retry)
 *
 *   4. No stored response:
 *        a. Acquire distributed lock (SET NX, 30s TTL)
 *        b. Lock not acquired -> 409 Conflict (another request in-flight)
 *        c. Lock acquired -> intercept res.json(), store response after send,
 *           release lock in finally block.
 *
 * Why intercept res.json() instead of a response-finished hook?
 *   res.on("finish") fires after the response is sent but gives no access to
 *   the body. Patching res.json() gives us the body synchronously before send,
 *   so we can persist it while still returning the original response to the
 *   client without any added latency.
 *
 * Why not store on error responses (4xx/5xx)?
 *   Storing a 422 "insufficient stock" under an idempotency key would make
 *   subsequent retries permanently receive that 422 even if stock is restocked.
 *   We only store 2xx responses - failures should be retryable.
 */
export function idempotencyMiddleware(): RequestHandler {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        const idempotencyKey = req.headers["idempotency-key"] as
            | string
            | undefined;

        // Key is optional - no key means client doesn't need idempotency guarantees
        if (!idempotencyKey) {
            next();
            return;
        }

        const userId = req.user?.id;
        if (!userId) {
            // This should never happen if authMiddleware ran first, but guard anyway
            next(
                new Error(
                    "Idempotency middleware requires authentication - ensure authMiddleware runs first",
                ),
            );
            return;
        }

        const service = resolve(IdempotencyService);

        // Compute request body hash upfront - needed for both mismatch check and storage
        const incomingHash = service.hashBody(req.body);

        // Check for a stored response (replay path)
        const existing = await service.get(userId, idempotencyKey);

        if (existing) {
            // Body mismatch check
            // If the stored entry has a requestHash and it doesn't match the current
            // body, this is a client bug: same key, different payload.
            // We reject with 422 rather than silently replaying the wrong response.
            if (existing.requestHash && existing.requestHash !== incomingHash) {
                const ageSeconds = Math.round(
                    (Date.now() - existing.cachedAt) / 1000,
                );

                logger.warn("[Idempotency] Body mismatch detected", {
                    idempotencyKey,
                    userId,
                    storedHash: existing.requestHash,
                    incomingHash,
                    cachedAt: new Date(existing.cachedAt).toISOString(),
                    ageSeconds,
                });

                res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
                    success: false,
                    code: "IDEMPOTENCY_BODY_MISMATCH",
                    message:
                        "The request body does not match the body used when this " +
                        "Idempotency-Key was first submitted. Use a new key for a " +
                        "different request, or retry with the original body.",
                    hint: "Each unique Idempotency-Key must always be paired with the same request body.",
                });
                return;
            }

            // Hash matches (or no hash stored - backwards-compatible with old entries)
            const ageSeconds = Math.round(
                (Date.now() - existing.cachedAt) / 1000,
            );
            logger.debug("[Idempotency] Replaying stored response", {
                idempotencyKey,
                userId,
                statusCode: existing.statusCode,
                cachedAt: new Date(existing.cachedAt).toISOString(),
                ageSeconds,
            });

            res.status(existing.statusCode).json(existing.body);
            return;
        }

        // No stored response - acquire lock and process
        const lockAcquired = await service.acquireLock(userId, idempotencyKey);

        if (!lockAcquired) {
            // Another request with the same key is currently being processed.
            // The client should wait briefly and retry - the response will be
            // stored and replayed once the in-flight request completes.
            logger.warn("[Idempotency] Lock contention", {
                idempotencyKey,
                userId,
            });

            res.status(StatusCodes.CONFLICT).json({
                success: false,
                code: "IDEMPOTENCY_CONFLICT",
                message:
                    "A request with this Idempotency-Key is currently being processed. " +
                    "Retry in a few seconds to receive the stored response.",
            });
            return;
        }

        // Intercept res.json() to capture and store the response
        // We patch the method rather than using a finish hook because we need
        // access to the serialised body before it leaves the process.
        const originalJson = res.json.bind(res);

        res.json = (body: unknown): Response => {
            // Only store successful responses (2xx).
            // Failures (4xx/5xx) should remain retryable - a 422 "insufficient stock"
            // cached under this key would permanently block legitimate retries.
            if (res.statusCode >= 200 && res.statusCode < 300) {
                service
                    .store(userId, idempotencyKey, {
                        statusCode: res.statusCode,
                        body,
                        requestHash: incomingHash,
                    })
                    .finally(() => service.releaseLock(userId, idempotencyKey));
            } else {
                // Non-2xx: release lock immediately so the client can retry
                service.releaseLock(userId, idempotencyKey);
            }

            return originalJson(body);
        };

        next();
    };
}
