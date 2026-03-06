import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { RedisConnection, REDIS_CONNECTION } from "./RedisConnection.js";
import { logger } from "utils/logger.js";

@singleton()
export class CacheService {
    private readonly redis;

    constructor(
        @inject(REDIS_CONNECTION)
        private readonly redisConnection: RedisConnection,
    ) {
        this.redis = redisConnection.getClient();
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.redis.get(key);
            if (!value) return null;
            return JSON.parse(value) as T;
        } catch (err) {
            logger.error("[Cache] GET failed", {
                key,
                error: (err as Error).message,
            });
            return null; // fail open - go to DB
        }
    }

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        try {
            await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        } catch (err) {
            logger.error("[Cache] SET failed", {
                key,
                error: (err as Error).message,
            });
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (err) {
            logger.error("[Cache] DEL failed", {
                key,
                error: (err as Error).message,
            });
        }
    }

    /**
     * SCAN-based pattern delete. Never use KEYS in production - it's O(N) blocking.
     * SCAN is O(1) per cursor iteration, safe on large keyspaces.
     */
    async invalidatePattern(pattern: string): Promise<void> {
        try {
            let cursor = "0";
            let deletedCount = 0;
            do {
                const [nextCursor, keys] = await this.redis.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    100,
                );
                cursor = nextCursor;
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                    deletedCount += keys.length;
                }
            } while (cursor !== "0");

            if (deletedCount > 0) {
                logger.debug("[Cache] Pattern invalidated", {
                    pattern,
                    deletedCount,
                });
            }
        } catch (err) {
            logger.error("[Cache] INVALIDATE failed", {
                pattern,
                error: (err as Error).message,
            });
        }
    }
}
