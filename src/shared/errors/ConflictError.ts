import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 409 - resource conflict (duplicate email, duplicate SKU, etc.)
 * @example throw new ConflictError('USER_EMAIL_TAKEN', { email })
 */
export class ConflictError extends AppError {
    constructor(
        errorCode: ErrorCode = "CONFLICT",
        params: Record<string, string> = {},
    ) {
        super(errorCode, params);
    }
}
