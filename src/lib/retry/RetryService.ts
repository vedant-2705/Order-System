import { logger } from "utils/logger.js";

export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    isRetryable?: (err: Error) => boolean;
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Error patterns that indicate a transient infrastructure failure safe to retry.
 *
 * ECONNRESET     - TCP connection was forcibly closed by the remote peer mid-request
 * ETIMEDOUT      - connection or read timed out waiting for a response
 * ECONNREFUSED   - nothing was listening on the target port (service restarting)
 * socket hang up - Node's http/https agent received an abrupt EOF
 * 503            - upstream service temporarily unavailable
 * 502            - bad gateway / upstream not reachable at the load balancer
 * 
 * Intentionally excluded:
 *   4xx (except 429) - client errors are deterministic; retrying won't fix them
 *   500              - could be a bug, not necessarily transient
 *   ENOTFOUND        - DNS failure; retrying immediately won't help
 */
const DEFAULT_IS_RETRYABLE = (err: Error): boolean => {
    const retryablePatterns = [
        "ECONNRESET",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "socket hang up",
        "503",
        "502",
    ];
    return retryablePatterns.some((p) => err.message.includes(p));
};

/**
 * Executes `fn` with full-jitter exponential backoff on transient failures.
 *
 * ## Why full jitter?
 *
 * When many clients fail simultaneously (e.g. an upstream blip) and all retry
 * at the same time, they create a thundering herd that hammers the recovering
 * service with a burst exactly as large as the original traffic - potentially
 * preventing recovery entirely.
 *
 * Three common strategies and their tradeoffs:
 *
 *   Equal jitter:  wait = cap/2 + random(0, cap/2)
 *     Pro: each retry waits at least cap/2 - predictable minimum spacing
 *     Con: still clusters retries in the upper half of the window
 *
 *   Decorrelated:  wait = random(baseDelay, prev_wait * 3)
 *     Pro: very spread out
 *     Con: can grow unboundedly without a cap; harder to reason about
 *
 *   Full jitter:   wait = random(0, min(maxDelayMs, baseDelayMs * 2^(attempt-1)))
 *     Pro: best thundering-herd prevention - retries spread uniformly across
 *          the entire window [0, cap]. With N clients, expected concurrent
 *          load is 1/N of naive retry (proven by AWS: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
 *     Con: individual retry may wait 0ms (rare, statistically fine at scale)
 *
 * We use full jitter because this codebase may have many concurrent users
 * placing orders simultaneously - the thundering herd scenario is real.
 *
 * ## Formula
 *
 *   cap     = min(maxDelayMs, baseDelayMs * 2^(attempt - 1))
 *   delayMs = random(0, cap)
 *
 * Attempt 1: cap = min(maxDelayMs, base * 1)   -> uniform [0, base]
 * Attempt 2: cap = min(maxDelayMs, base * 2)   -> uniform [0, base*2]
 * Attempt 3: cap = min(maxDelayMs, base * 4)   -> uniform [0, base*4]
 * ...capped at maxDelayMs once base * 2^n exceeds it.
 *
 * ## Critical constraint - DO NOT wrap withAuditContext()
 *
 * This function must NEVER wrap a `withAuditContext()` call directly.
 * withAuditContext() contains wallet deductions, stock deductions, and
 * ledger entries. Retrying the entire transaction on failure would:
 *   - Create duplicate wallet deductions ("double charge")
 *   - Create duplicate ledger entries
 *   - Create duplicate orders
 *
 * Safe usage: wrap only external HTTP calls that happen AFTER the transaction
 * has already committed. The transaction itself has no side effects to undo
 * if it fails - Knex rolls it back cleanly and no external state was mutated.
 *
 * @example - safe: external HTTP after transaction
 * ```typescript
 * const order = await withAuditContext(db, async (trx) => { ... });
 * // Transaction committed - now safe to retry external calls
 * await withRetry(
 *   () => emailService.sendConfirmation(order),
 *   { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 2000,
 *     isRetryable: (err) => !err.message.includes("4") }
 * );
 * ```
 *
 * @example - safe: payment gateway capture after transaction
 * ```typescript
 * await withRetry(
 *   () => paymentGateway.capture(paymentIntentId),
 *   { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000 }
 * );
 * ```
 *
 * @param fn   - Async function to execute. Must be safe to call multiple times.
 * @param opts - Retry configuration.
 * @returns The resolved value of `fn` on success.
 * @throws The last error if all attempts are exhausted or error is non-retryable.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOptions,
): Promise<T> {
    const isRetryable = opts.isRetryable ?? DEFAULT_IS_RETRYABLE;
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err as Error;

            // If this was the last attempt, or the error is not retryable, throw immediately.
            // Non-retryable errors (4xx, bugs, etc.) should surface to the caller right away -
            // waiting and retrying would just add latency with no chance of success.
            if (attempt === opts.maxAttempts || !isRetryable(lastError)) {
                throw lastError;
            }

            // Full jitter: cap grows exponentially per attempt, delay is random within [0, cap]
            const cap = Math.min(
                opts.maxDelayMs,
                opts.baseDelayMs * Math.pow(2, attempt - 1),
            );
            const delayMs = Math.random() * cap;

            if (opts.onRetry) {
                opts.onRetry(attempt, lastError, delayMs);
            } else {
                logger.warn("[Retry] Attempt failed, retrying", {
                    attempt,
                    maxAttempts: opts.maxAttempts,
                    delayMs: Math.round(delayMs),
                    error: lastError.message,
                });
            }

            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    // TypeScript requires this even though the loop always returns or throws
    throw lastError;
}
