import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 400 - malformed or semantically wrong request.
 * @example throw new BadRequestError('BAD_REQUEST')
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
