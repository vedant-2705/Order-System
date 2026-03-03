/**
 * @module UnauthorizedError
 * @description HTTP 401 Unauthorized error.
 * Thrown when the caller’s identity cannot be established
 * (absent, expired, or invalid token).
 *
 * Remember the distinction:
 *   - 401 Unauthorized -> we don’t know who you are
 *   - 403 Forbidden    -> we know who you are, but you can’t do this
 */
import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 401  caller’s identity cannot be established.
 */
export class UnauthorizedError extends AppError {
    constructor(code: ErrorCode = "UNAUTHORIZED") {
        super(code);
    }
}
