import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 403 — caller is authenticated but lacks permission.
 * 401 = we don't know who you are.
 * 403 = we know who you are, but you can't do this.
 */
export class ForbiddenError extends AppError {
    constructor(code: ErrorCode = "FORBIDDEN") {
        super(code);
    }
}
