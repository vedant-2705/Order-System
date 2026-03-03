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

//  Standalone instance for use outside DI context 
// Used in src/index.ts before the container is bootstrapped,
// and in knexfile.ts / other config files that can't use DI.
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

export const LOGGER = Symbol.for("Logger");