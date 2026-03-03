/**
 * @module BadRequestError
 * @description HTTP 400 Bad Request error.
 * Thrown when the request is syntactically malformed or missing required fields.
 * Extends `AppError` so the global error handler processes it automatically.
 */
import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 400  malformed or semantically incorrect request.
 *
 * @example
 * throw new BadRequestError('BAD_REQUEST');
 */
export class BadRequestError extends AppError {
    constructor(
        errorCode: ErrorCode = "BAD_REQUEST",
        params: Record<string, string> = {},
        details?: unknown,
    ) {
        super(errorCode, params, details);
    }
}
