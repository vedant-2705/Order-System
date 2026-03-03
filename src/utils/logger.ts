/**
 * @module Logger
 * @description Application-wide structured logger backed by Winston.
 *
 * Two exports:
 *   - `Logger` class   tsyringe-injectable singleton for use inside DI-managed
 *     classes (repositories, services, use cases).  Inject with `@inject(Logger)`.
 *   - `logger` object  standalone Winston instance for use in configuration files
 *     and bootstrap code that runs before the DI container is initialised
 *     (e.g. `app.ts`, `knexfile.ts`).
 *   - `LOGGER`         DI injection token for the `Logger` class.
 *
 * Log levels:
 *   production  -> info  (excludes debug noise in prod)
 *   development -> debug (full query and context logging)
 */
import "reflect-metadata";
import { singleton } from "tsyringe";
import winston, { Logger as WinstonLogger } from "winston";

//  Logger 
// @singleton() ensures one Winston instance for the entire process.
// Inject wherever logging is needed - no more importing a raw object.
//
// Usage:
//   constructor(@inject(Logger) private logger: Logger) {}
//   this.logger.info('Order created', { orderId });

/**
 * Injectable structured logger that wraps a Winston instance.
 *
 * @remarks
 * `@singleton()` guarantees one Winston logger for the entire process.
 * Inject this class into any DI-managed class that needs logging.
 *
 * @example
 * constructor(@inject(Logger) private readonly logger: Logger) {}
 * this.logger.info('Order created', { orderId, total });
 */
@singleton()
export class Logger {
    private readonly _logger: WinstonLogger;

    constructor() {
        this._logger = winston.createLogger({
            level: process.env.NODE_ENV === "production" ? "info" : "debug",
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize(),
                winston.format.printf(
                    ({ timestamp, level, message, ...meta }) => {
                        const metaStr = Object.keys(meta).length
                            ? "\n" + JSON.stringify(meta, null, 2)
                            : "";
                        return `${timestamp} [${level}]: ${message}${metaStr}`;
                    },
                ),
            ),
            transports: [new winston.transports.Console()],
        });
    }

    info(message: string, meta?: Record<string, unknown>): void {
        this._logger.info(message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        this._logger.debug(message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>): void {
        this._logger.warn(message, meta);
    }

    error(message: string, meta?: Record<string, unknown>): void {
        this._logger.error(message, meta);
    }
}

/**
 * Standalone Winston logger for use outside the DI container.
 *
 * @remarks
 * Used in `app.ts` before `registerDependencies()` is called,
 * and in configuration files (`knexfile.ts`) that cannot use DI.
 * Shares the same format and level settings as the injected `Logger` class.
 */
export const logger = winston.createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length
                ? "\n" + JSON.stringify(meta, null, 2)
                : "";
            return `${timestamp} [${level}]: ${message}${metaStr}`;
        }),
    ),
    transports: [new winston.transports.Console()],
});

/** DI injection token for the {@link Logger} class. */
export const LOGGER = Symbol.for("Logger");