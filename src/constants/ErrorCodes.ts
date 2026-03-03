/**
 * @module ErrorCodes
 * @description Centralised error code catalogue for the application.
 *
 * Every thrown error must reference a key from `ERROR_CODES`  never a
 * raw string.  This ensures:
 *   - Consistent HTTP status codes across all endpoints
 *   - Machine-readable `code` field in every API error response
 *   - A single place to update an error's status, title, or message
 *
 * Message templates support `{placeholder}` interpolation via `formatMessage()`.
 * e.g. `"User with id '{id}' was not found"` receives `{ id: '42' }`.
 *
 * Domain grouping:
 *   - Generic HTTP   (4xx/5xx catch-alls)
 *   - User           (auth, registration)
 *   - Product        (catalogue, inventory)
 *   - Order          (lifecycle, cancellation)
 *   - Wallet         (balance, transactions)
 *   - Auth           (tokens, permissions)
 */
import { StatusCodes, ReasonPhrases } from "http-status-codes";

/** Shape of a single entry in the `ERROR_CODES` catalogue. */
export interface ErrorDefinition {
    code: string;        // machine-readable identifier sent in the API response
    statusCode: number;  // HTTP status code for `res.status()`
    title: string;       // short stable summary (RFC 7807 `title`)
    message: string;     // human-readable detail; may contain `{placeholder}` tokens
}

export const ERROR_CODES = {
    // Generic HTTP
    INTERNAL_SERVER_ERROR: {
        code: "INTERNAL_SERVER_ERROR",
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        title: ReasonPhrases.INTERNAL_SERVER_ERROR,
        message: "An unexpected error occurred",
    },
    VALIDATION_FAILED: {
        code: "VALIDATION_FAILED",
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        title: ReasonPhrases.UNPROCESSABLE_ENTITY,
        message: "The request body contains invalid data",
    },
    NOT_FOUND: {
        code: "NOT_FOUND",
        statusCode: StatusCodes.NOT_FOUND,
        title: ReasonPhrases.NOT_FOUND,
        message: "The requested resource was not found",
    },
    CONFLICT: {
        code: "CONFLICT",
        statusCode: StatusCodes.CONFLICT,
        title: ReasonPhrases.CONFLICT,
        message: "A resource with this value already exists",
    },
    BAD_REQUEST: {
        code: "BAD_REQUEST",
        statusCode: StatusCodes.BAD_REQUEST,
        title: ReasonPhrases.BAD_REQUEST,
        message: "The request is malformed or missing required fields",
    },
    UNAUTHORIZED: {
        code: "UNAUTHORIZED",
        statusCode: StatusCodes.UNAUTHORIZED,
        title: ReasonPhrases.UNAUTHORIZED,
        message: "Authentication is required",
    },
    FORBIDDEN: {
        code: "FORBIDDEN",
        statusCode: StatusCodes.FORBIDDEN,
        title: ReasonPhrases.FORBIDDEN,
        message: "You do not have permission to perform this action",
    },
    // User domain
    USER_NOT_FOUND: {
        code: "USER_NOT_FOUND",
        statusCode: StatusCodes.NOT_FOUND,
        title: ReasonPhrases.NOT_FOUND,
        message: "User with id '{id}' was not found",
    },
    USER_EMAIL_TAKEN: {
        code: "USER_EMAIL_TAKEN",
        statusCode: StatusCodes.CONFLICT,
        title: ReasonPhrases.CONFLICT,
        message: "An account with email '{email}' already exists",
    },
    // Product domain
    PRODUCT_NOT_FOUND: {
        code: "PRODUCT_NOT_FOUND",
        statusCode: StatusCodes.NOT_FOUND,
        title: ReasonPhrases.NOT_FOUND,
        message: "Product with id '{id}' was not found",
    },
    PRODUCT_SKU_TAKEN: {
        code: "PRODUCT_SKU_TAKEN",
        statusCode: StatusCodes.CONFLICT,
        title: ReasonPhrases.CONFLICT,
        message: "A product with SKU '{sku}' already exists",
    },
    PRODUCT_OUT_OF_STOCK: {
        code: "PRODUCT_OUT_OF_STOCK",
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        title: ReasonPhrases.UNPROCESSABLE_ENTITY,
        message: "Product '{name}' is out of stock",
    },
    // Order domain
    ORDER_NOT_FOUND: {
        code: "ORDER_NOT_FOUND",
        statusCode: StatusCodes.NOT_FOUND,
        title: ReasonPhrases.NOT_FOUND,
        message: "Order with id '{id}' was not found",
    },
    ORDER_CANNOT_BE_CANCELLED: {
        code: "ORDER_CANNOT_BE_CANCELLED",
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        title: ReasonPhrases.UNPROCESSABLE_ENTITY,
        message:
            "Order '{orderNumber}' cannot be cancelled in status '{status}'",
    },
    // Wallet domain
    WALLET_NOT_FOUND: {
        code: "WALLET_NOT_FOUND",
        statusCode: StatusCodes.NOT_FOUND,
        title: ReasonPhrases.NOT_FOUND,
        message: "Wallet for user '{userId}' was not found",
    },
    INSUFFICIENT_BALANCE: {
        code: "INSUFFICIENT_BALANCE",
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        title: ReasonPhrases.UNPROCESSABLE_ENTITY,
        message:
            "Insufficient wallet balance. Required: {required}, Available: {available}",
    },
    INSUFFICIENT_STOCK: {
        code: "INSUFFICIENT_STOCK",
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        title: ReasonPhrases.UNPROCESSABLE_ENTITY,
        message:
            "Insufficient stock for product '{productId}'. Requested: {requested}, Available: {available}",
    },
    // Auth
    INVALID_CREDENTIALS: {
        code: "INVALID_CREDENTIALS",
        statusCode: StatusCodes.UNAUTHORIZED,
        title: ReasonPhrases.UNAUTHORIZED,
        message: "Invalid email or password",
    },
    INVALID_TOKEN: {
        code: "INVALID_TOKEN",
        statusCode: StatusCodes.UNAUTHORIZED,
        title: ReasonPhrases.UNAUTHORIZED,
        message: "Token is invalid or has expired",
    },
    INSUFFICIENT_PERMISSIONS: {
        code: "INSUFFICIENT_PERMISSIONS",
        statusCode: StatusCodes.FORBIDDEN,
        title: ReasonPhrases.FORBIDDEN,
        message: "You do not have permission to perform this action",
    },
} as const;

/**
 * Interpolates `{placeholder}` tokens in an error message template.
 *
 * @param template - Message string from `ERROR_CODES`, e.g. `"User '{id}' not found"`.
 * @param params   - Key/value pairs to substitute.  Unknown keys are left as-is.
 * @returns The interpolated message string.
 *
 * @example
 * formatMessage("User with id '{id}' was not found", { id: '42' })
 * // => "User with id '42' was not found"
 */
export function formatMessage(
    template: string,
    params: Record<string, string> = {},
): string {
    return template.replace(
        /\{(\w+)\}/g,
        (_, key) => params[key] ?? `{${key}}`,
    );
}

/** Union type of all valid error code keys in the catalogue. */
export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Mirror of `ERROR_CODES` keys as string values for runtime key-presence checks.
 * Avoids string literals at call sites: use `ErrorKeys.NOT_FOUND` instead of `'NOT_FOUND'`.
 */
export const ErrorKeys = Object.fromEntries(
    Object.keys(ERROR_CODES).map((k) => [k, k]),
) as { [K in ErrorCode]: K };
