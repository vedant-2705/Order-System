/**
 * @module ConflictError
 * @description HTTP 409 Conflict error.
 * Thrown when an operation would create a duplicate resource
 * (e.g. duplicate email address, duplicate product SKU).
 */
import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 409  resource state conflict (duplicate email, duplicate SKU, etc.).
 *
 * @example
 * throw new ConflictError('USER_EMAIL_TAKEN', { email: user.email });
 */
export class ConflictError extends AppError {
    constructor(
        errorCode: ErrorCode = "CONFLICT",
        params: Record<string, string> = {},
    ) {
        super(errorCode, params);
    }
}
