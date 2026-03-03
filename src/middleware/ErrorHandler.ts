import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import { AppError } from "shared/errors/AppError.js";
import { errorResponse } from "helpers/ResponseHelper.js";
import { handleAppError } from "helpers/errors/AppErrorHelper.js";
import { handleZodError } from "helpers/errors/ZodErrorHelper.js";
import { handleDbError } from "helpers/errors/DbErrorHelper.js";
import { DbErrorCodes } from "constants/DbErrorCodes.js";
import { logger } from "utils/logger.js";

/**
 * Global error handler - must be registered LAST in the middleware chain.
 * All four parameters required by Express for error middleware.
 *
 * Priority order:
 *   1. ZodError         -> 422 with field-level errors
 *   2. AppError         -> statusCode from error definition
 *   3. pg DB error      -> mapped via DbErrorHelper
 *   4. Everything else  -> 500
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    // 1. Zod validation error
    if (err instanceof ZodError) {
        handleZodError(err, req, res);
        return;
    }

    // 2. Known application error (NotFoundError, InsufficientBalanceError etc.)
    if (err instanceof AppError) {
        // Only log server errors — 4xx are expected, not bugs
        if (err.statusCode >= 500) {
            logger.error("[AppError]", {
                code: err.code,
                message: err.message,
                stack: err.stack,
            });
        }
        handleAppError(err, req, res);
        return;
    }

    // 3. pg driver error - has a .code property with PostgreSQL error code
    const dbErr = err as Error & { code?: string };
    const pgCodes = Object.values(DbErrorCodes) as string[];
    if (dbErr.code && pgCodes.includes(dbErr.code)) {
        logger.error("[DbError]", { code: dbErr.code, message: dbErr.message });
        handleDbError(dbErr, req, res);
        return;
    }

    // 4. Unexpected error - log everything, respond with 500
    logger.error("[UnhandledError]", {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
        errorResponse(
            "INTERNAL_SERVER_ERROR",
            "Internal Server Error",
            process.env.NODE_ENV === "production"
                ? "An unexpected error occurred"
                : err.message,
            StatusCodes.INTERNAL_SERVER_ERROR,
            req.path,
        ),
    );
}
