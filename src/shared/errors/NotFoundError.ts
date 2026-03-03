import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 404 — resource not found.
 * @example throw new NotFoundError('ORDER_NOT_FOUND', { id: String(orderId) })
 */
export class NotFoundError extends AppError {
    constructor(
        errorCode: ErrorCode = "NOT_FOUND",
        params: Record<string, string> = {},
    ) {
        super(errorCode, params);
    }
}
