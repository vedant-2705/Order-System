/**
 * @module DbErrorHelper
 * @description Response formatter for PostgreSQL driver (`pg`) errors.
 *
 * Maps the numeric PostgreSQL error code on `err.code` through
 * `DB_ERROR_MAP` to an `ErrorCode` key, then looks up the full definition
 * in `ERROR_CODES` to build a consistent RFC 7807 response.
 *
 * No switch statements and no hardcoded strings  all mappings live in
 * `constants/DbErrorCodes.ts`.
 *
 * @see constants/DbErrorCodes.ts  for the code -> ErrorCode map
 * @see constants/ErrorCodes.ts    for status codes and messages
 */
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { DB_ERROR_MAP } from "constants/DbErrorCodes.js";
import { ERROR_CODES } from "constants/ErrorCodes.js";
import { errorResponse } from "../ResponseHelper.js";

/**
 * Sends an RFC 7807 error response derived from a pg driver error.
 *
 * @remarks
 * If the pg error code is not in `DB_ERROR_MAP` (unexpected DB error),
 * falls back to a generic 500 response.  In production the raw `err.message`
 * is suppressed and replaced with the catalogue's generic message to avoid
 * leaking internal schema details to the client.
 *
 * @param err - The pg driver error containing a `code` property (e.g. `'23505'`).
 * @param req - Express request  used for the `instance` (path) field.
 * @param res - Express response  the JSON response is written here.
 */
export function handleDbError(
    err: Error & { code?: string },
    req: Request,
    res: Response,
): void {
    const errorCodeKey = err.code ? DB_ERROR_MAP[err.code] : undefined;

    if (errorCodeKey) {
        const def = ERROR_CODES[errorCodeKey];
        res.status(def.statusCode).json(
            errorResponse(
                def.code,
                def.title,
                def.message,
                def.statusCode,
                req.path,
            ),
        );
        return;
    }

    // Unknown DB error - generic 500
    const def = ERROR_CODES.INTERNAL_SERVER_ERROR;
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
        errorResponse(
            def.code,
            def.title,
            process.env.NODE_ENV === "production" ? def.message : err.message,
            StatusCodes.INTERNAL_SERVER_ERROR,
            req.path,
        ),
    );
}
