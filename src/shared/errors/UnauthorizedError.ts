import { ErrorCode } from "constants/ErrorCodes.js";
import { AppError } from "./AppError.js";

/**
 * HTTP 401 — caller's identity cannot be established (no/invalid token).
 * 401 = we don't know who you are.
 * 403 = we know who you are, but you can't do this.
 */
export class UnauthorizedError extends AppError {
    constructor(code: ErrorCode = "UNAUTHORIZED") {
        super(code);
    }
}
