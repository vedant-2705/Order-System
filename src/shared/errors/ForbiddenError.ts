/**
 * @module ForbiddenError
 * @description HTTP 403 Forbidden error.
 * Thrown when the caller is authenticated but lacks permission for the action.
 *
 * Remember the distinction:
 *   - 401 Unauthorized -> we don’t know who you are (missing / invalid token)
 *   - 403 Forbidden    -> we know who you are, but you can’t do this
 */
import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 403  caller is authenticated but lacks the required permission.
 */
export class ForbiddenError extends AppError {
    constructor(code: ErrorCode = "FORBIDDEN") {
        super(code);
    }
}
