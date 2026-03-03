/**
 * @module AppErrorHelper
 * @description Response formatter for `AppError` instances.
 *
 * `AppError` already carries `code`, `title`, `statusCode`, and `message`
 * populated from `ERROR_CODES` in its constructor.  This helper simply
 * reads those fields and delegates to `ResponseHelper.errorResponse()` to
 * build the RFC 7807 response body.
 *
 * @see shared/errors/AppError.ts
 * @see helpers/ResponseHelper.ts
 */
import { Request, Response } from "express";
import { AppError } from "shared/errors/AppError.js";
import { errorResponse } from "../ResponseHelper.js";

/**
 * Sends an RFC 7807 error response derived from an `AppError` instance.
 *
 * @remarks
 * `AppError` already carries `title` and `statusCode` from `ERROR_CODES`
 * (populated in its constructor), so no catalogue lookup is needed here.
 * Optional `details` (e.g. Zod issue array) are forwarded as the `errors` field.
 *
 * @param err - The caught `AppError` (or subclass thereof).
 * @param req - Express request  used for the `instance` (path) field.
 * @param res - Express response  the JSON response is written here.
 */
export function handleAppError(
    err: AppError,
    req: Request,
    res: Response,
): void {
    res.status(err.statusCode).json(
        errorResponse(
            err.code,
            err.title,
            err.message,
            err.statusCode,
            req.path,
            err.details,
        ),
    );
}
