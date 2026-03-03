/**
 * @module AppError
 * @description Base class for all operational application errors.
 *
 * Every domain and HTTP error in this application extends `AppError`.
 * Constructed from a typed `ErrorCode` key so HTTP status codes, titles,
 * and message templates are always sourced from the central catalogue
 *  never from inline magic strings.
 *
 * The global `errorHandler` middleware identifies `AppError` instances by
 * `instanceof` and delegates to `AppErrorHelper` for the RFC 7807 response.
 *
 * @see constants/ErrorCodes.ts  for the full error catalogue
 * @see middleware/ErrorHandler.ts
 */
import {
    ERROR_CODES,
    ErrorCode,
    formatMessage,
} from "constants/ErrorCodes.js";

/**
 * Base class for all operational application errors.
 *
 * @remarks
 * `isOperational = true` signals to the error handler that this is an
 * expected business error (4xx) and should **not** trigger an alert.
 * Set `isOperational = false` for programmer errors that should page on-call.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly title: string;
    public readonly isOperational: boolean;
    public readonly details?: unknown;

    /**
     * @param errorCode     - Key from `ERROR_CODES`; determines status, title, and message.
     * @param params        - Interpolation values for `{placeholder}` tokens in the message.
     * @param details       - Optional structured payload (e.g. Zod field errors).
     * @param isOperational - `true` for expected client errors; `false` for programmer errors.
     */
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
