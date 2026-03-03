/**
 * @module DatabaseProvider
 * @description Manages the Knex connection pool singleton.
 *
 * Implements a singleton via `@singleton()` so tsyringe creates exactly one
 * instance per process - preventing duplicate connection pools.
 *
 * Responsibilities:
 *   - Initialises the Knex instance from environment-driven config
 *   - Wires pool-level event listeners for observability
 *   - Exposes the Knex client for repository consumption
 *   - Provides health-check (ping) and graceful-shutdown (destroy) helpers
 *
 * @see config/knexfile.ts for pool tuning parameters
 */
import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import knex, { Knex } from "knex";
import knexConfig from "config/knexfile.js";
import { Logger } from "winston";
import { LOGGER } from "utils/logger.js";

/**
 * Singleton that owns the Knex connection pool for the lifetime of the process.
 *
 * @remarks
 * Repositories inject `DatabaseProvider` and call `getClient` to obtain the
 * Knex instance. They never instantiate Knex themselves, ensuring the pool
 * is shared and there is only ever one set of open connections.
 *
 * Pool event listeners are wired in the constructor so pool activity is
 * visible in the application log from the very first query.
 */
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

    /**
     * Returns the underlying Knex query builder for direct use by repositories.
     *
     * @remarks
     * Repositories call `dbProvider.getClient` once in their constructor and
     * store it as `protected readonly db`.  They never import `knex` directly.
     */
    get getClient(): Knex {
        return this._db;
    }

    /**
     * Returns a snapshot of connection pool counters.
     * Surfaced on the `/health` endpoint and debug logs.
     *
     * @returns Object with `used`, `free`, `pending`, `min`, `max` counts.
     */
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

    /**
     * Verifies the database is reachable by executing `SELECT 1`.
     * Called at server startup and by the `/health` endpoint.
     *
     * @throws If the database is unreachable or the query times out.
     */
    async ping(): Promise<void> {
        await this._db.raw("SELECT 1");
        this.logger.debug("[DB] Ping OK", this.getPoolStats());
    }

    /**
     * Drains the connection pool and closes all open connections.
     *
     * @remarks
     * Must be called on `SIGTERM` / `SIGINT` before `process.exit()`.
     * Without this, in-flight queries may be cut off mid-execution and
     * the OS will forcibly close sockets, which can corrupt transactions.
     */
    async destroy(): Promise<void> {
        await this._db.destroy();
        this.logger.info("[DB] Connection pool destroyed");
    }

    /**
     * Attaches Knex pool event listeners for operational visibility.
     *
     * @remarks
     * Events logged at DEBUG level only - no production noise.
     * Registered once in the constructor.
     * Particularly useful when observing pool contention under load.
     */
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

/** DI injection token for {@link DatabaseProvider}. */
export const DATABASE_PROVIDER = Symbol.for("DatabaseProvider");