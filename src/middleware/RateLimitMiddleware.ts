import { Request, Response, NextFunction, RequestHandler } from "express";
import { resolve } from "config/di/container.js";
import { RateLimiter } from "lib/rate-limit/RateLimiter.js";
import { StatusCodes } from "http-status-codes";
import { errorResponse } from "helpers/ResponseHelper.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

export interface RateLimitOptions {
    windowMs: number;
    max: number;
    identifierFn: (req: Request) => string;
}

/**
 * Factory that returns an Express middleware enforcing a Redis sliding-window
 * rate limit for the given options.
 *
 * Sets standard rate-limit response headers on every request so clients can
 * self-throttle before hitting the limit:
 *   X-RateLimit-Limit     - max requests allowed in the window
 *   X-RateLimit-Remaining - requests left in the current window
 *   X-RateLimit-Reset     - Unix timestamp (seconds) when the window resets
 *   Retry-After           - seconds to wait before retrying (429 only)
 *
 * Fails open: if Redis is unavailable the request is allowed through.
 * This prevents Redis outages from taking down the API entirely.
 */
export function rateLimitMiddleware(opts: RateLimitOptions): RequestHandler {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        const limiter = resolve(RateLimiter);
        const result = await limiter.check(
            opts.identifierFn(req),
            opts.windowMs,
            opts.max,
        );

        res.setHeader("X-RateLimit-Limit", result.limit);
        res.setHeader("X-RateLimit-Remaining", result.remaining);
        res.setHeader("X-RateLimit-Reset", result.resetAt);

        if (!result.allowed) {
            res.setHeader("Retry-After", result.retryAfter ?? 60);
            res.status(StatusCodes.TOO_MANY_REQUESTS).json(
                errorResponse(
                    ErrorKeys.RATE_LIMIT_EXCEEDED,
                    "Too Many Requests",
                    `Rate limit exceeded. Retry in ${result.retryAfter} seconds.`,
                    StatusCodes.TOO_MANY_REQUESTS,
                    req.path,
                ),
            );
            return;
        }
        next();
    };
}

/** Identifies requests by IP address - used for auth endpoints (pre-login, no user yet). */
export const byIp = (req: Request): string => `ip:${req.ip ?? "unknown"}`;

/** Identifies requests by authenticated user ID, falling back to IP for unauthenticated paths. */
export const byUserId = (req: Request): string =>
    `user:${req.user?.id ?? req.ip ?? "unknown"}`;

/**
 * Strict limiter for auth endpoints (login, register).
 * 10 attempts per minute per IP - tight enough to block brute-force,
 * loose enough for legitimate users who mistype their password a few times.
 */
export const authRateLimit = rateLimitMiddleware({
    windowMs: 60_000,
    max: 10,
    identifierFn: byIp,
});

/**
 * General API limiter for authenticated routes.
 * 100 requests per minute per user - generous for normal use,
 * sufficient to prevent abusive scraping or accidental tight loops.
 */
export const apiRateLimit = rateLimitMiddleware({
    windowMs: 60_000,
    max: 100,
    identifierFn: byUserId,
});
