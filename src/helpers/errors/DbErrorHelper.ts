import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { DB_ERROR_MAP } from "constants/DbErrorCodes.js";
import { ERROR_CODES } from "constants/ErrorCodes.js";
import { errorResponse } from "../ResponseHelper.js";

/**
 * Handles pg driver errors.
 * Looks up the pg error code in DB_ERROR_MAP -> gets the ErrorCode key ->
 * reads title, statusCode, message from ERROR_CODES.
 * No switch statements, no hardcoded strings anywhere.
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
