import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { RedisConnection, REDIS_CONNECTION } from "cache/RedisConnection.js";
import { v4 as uuidv4 } from "uuid";

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}

// Atomic Lua script - prevents race conditions between count-check and increment.
// Uses a sorted set (ZSET) keyed by request timestamp.
// ZREMRANGEBYSCORE prunes entries outside the sliding window before counting.
// Entire script runs atomically in Redis - no TOCTOU between check and write.
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local uid = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = 0
  if oldest[2] then
    retryAfter = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
  end
  return {0, count, limit, retryAfter}
end

redis.call('ZADD', key, now, uid)
redis.call('PEXPIRE', key, window)
return {1, count + 1, limit, 0}
`;

@singleton()
export class RateLimiter {
    private readonly redis;

    constructor(
        @inject(REDIS_CONNECTION)
        private readonly redisConnection: RedisConnection,
    ) {
        this.redis = redisConnection.getClient();
    }

    async check(
        identifier: string,
        windowMs: number,
        limit: number,
    ): Promise<RateLimitResult> {
        const key = `rate_limit:${identifier}`;
        const now = Date.now();

        try {
            const result = (await this.redis.eval(
                SLIDING_WINDOW_SCRIPT,
                1,
                key,
                now,
                windowMs,
                limit,
                uuidv4(),
            )) as [number, number, number, number];

            const [allowed, count, maxLimit, retryAfterSec] = result;
            return {
                allowed: allowed === 1,
                limit: maxLimit,
                remaining: Math.max(0, maxLimit - count),
                resetAt: Math.ceil((now + windowMs) / 1000),
                retryAfter: allowed === 0 ? retryAfterSec : undefined,
            };
        } catch {
            // Redis down -> fail open (allow request) to avoid blocking legitimate traffic
            return {
                allowed: true,
                limit,
                remaining: limit - 1,
                resetAt: Math.ceil((now + windowMs) / 1000),
            };
        }
    }
}
