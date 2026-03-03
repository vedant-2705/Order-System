import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import knex, { Knex } from "knex";
import knexConfig from "config/knexfile.js";
import { Logger } from "winston";
import { LOGGER } from "utils/logger.js";

@singleton()
export class DatabaseProvider {
    private readonly _db: Knex;

    constructor(
        @inject(LOGGER)
        private readonly logger: Logger,
    ) {
        const env = process.env.NODE_ENV || "development";
        const config = knexConfig[env] as Knex.Config;

        this._db = knex(config);
        this._wirePoolEvents();

        this.logger.info("[DB] Connection pool initialised", {
            min: config.pool?.min,
            max: config.pool?.max,
        });
    }

    //  Public accessor 
    // Repositories inject DatabaseProvider and call .getClient to get the Knex instance.
    // They never instantiate Knex themselves.
    get getClient(): Knex {
        return this._db;
    }

    //  Pool stats for health checks / monitoring 
    getPoolStats() {
        const pool = this._db.client.pool;
        return {
            used: pool.numUsed(),
            free: pool.numFree(),
            pending: pool.numPendingAcquires(),
            min: this._db.client.config.pool?.min,
            max: this._db.client.config.pool?.max,
        };
    }

    //  Health check 
    async ping(): Promise<void> {
        await this._db.raw("SELECT 1");
        this.logger.debug("[DB] Ping OK", this.getPoolStats());
    }

    //  Graceful shutdown 
    // Call this on SIGTERM/SIGINT to drain the pool before process exits.
    // Without this, in-flight queries may be cut off mid-execution.
    async destroy(): Promise<void> {
        await this._db.destroy();
        this.logger.info("[DB] Connection pool destroyed");
    }

    //  Pool event logging 
    // Wired once in constructor - helps observe pool behaviour during
    // the connection pooling simulation section of the assignment.
    private _wirePoolEvents(): void {
        const pool = this._db.client.pool;

        pool.on("createSuccess", () => {
            this.logger.debug("[POOL] New connection created", {
                total: pool.numUsed() + pool.numFree(),
            });
        });

        pool.on("acquireSuccess", () => {
            this.logger.debug("[POOL] Connection acquired", {
                used: pool.numUsed(),
                free: pool.numFree(),
                pending: pool.numPendingAcquires(),
            });
        });

        pool.on("release", () => {
            this.logger.debug("[POOL] Connection released", {
                used: pool.numUsed(),
                free: pool.numFree(),
            });
        });

        pool.on("destroySuccess", () => {
            this.logger.debug("[POOL] Connection destroyed", {
                remaining: pool.numUsed() + pool.numFree(),
            });
        });

        pool.on("createFail", (_eventId: string, err: Error) => {
            this.logger.error("[POOL] Failed to create connection", {
                error: err.message,
            });
        });
    }
}

export const DATABASE_PROVIDER = Symbol.for("DatabaseProvider");