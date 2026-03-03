/**
 * @module NotFoundError
 * @description HTTP 404 Not Found error.
 * Thrown when a requested resource does not exist or has been soft-deleted.
 */
import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 404  resource not found or soft-deleted.
 *
 * @example
 * throw new NotFoundError('ORDER_NOT_FOUND', { id: String(orderId) });
 */
export class NotFoundError extends AppError {
    constructor(
        errorCode: ErrorCode = "NOT_FOUND",
        params: Record<string, string> = {},
    ) {
        super(errorCode, params);
    }
}
