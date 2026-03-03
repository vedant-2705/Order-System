import {
    ERROR_CODES,
    ErrorCode,
    formatMessage,
} from "constants/ErrorCodes.js";

/**
 * Base application error.
 * Takes an ErrorCode key from the catalogue - never raw strings.
 * All domain errors extend this.
 * The global error handler identifies AppError instances to return
 * structured RFC 7807 responses.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly title: string;
    public readonly isOperational: boolean;
    public readonly details?: unknown;

    constructor(
        errorCode: ErrorCode,
        params: Record<string, string> = {},
        details?: unknown,
        isOperational: boolean = true,
    ) {
        const def = ERROR_CODES[errorCode];
        super(formatMessage(def.message, params));

        this.code = def.code;
        this.statusCode = def.statusCode;
        this.title = def.title;
        this.isOperational = isOperational;
        this.details = details;

        Error.captureStackTrace(this, this.constructor);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
