import "reflect-metadata";
import { singleton } from "tsyringe";
import { Redis } from "ioredis";
import { logger } from "utils/logger.js";
import { ENV } from "config/env.js";

@singleton()
export class RedisConnection {
    private readonly client: Redis;

    constructor() {
        this.client = new Redis({
            host: ENV.REDIS_HOST || "localhost",
            port: ENV.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000),
            enableReadyCheck: true,
            lazyConnect: false,
        });

        this.client.on("connect", () => logger.info("[Redis] Connected"));
        this.client.on("error", (err) =>
            logger.error("[Redis] Error", { error: err }),
        );
        this.client.on("reconnecting", () =>
            logger.warn("[Redis] Reconnecting..."),
        );
    }

    getClient(): Redis {
        return this.client;
    }

    async ping(): Promise<void> {
        await this.client.ping();
    }

    async disconnect(): Promise<void> {
        await this.client.quit();
        logger.info("[Redis] Disconnected");
    }
}

export const REDIS_CONNECTION = Symbol.for("RedisConnection");
