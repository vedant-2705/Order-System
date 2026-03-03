/**
 * @module ResponseHelper
 * @description Factory functions for consistent API response envelopes.
 *
 * Success responses follow a simple { success, data, meta? } shape.
 *
 * Error responses follow RFC 7807 "Problem Details for HTTP APIs":
 *   https://datatracker.ietf.org/doc/html/rfc7807
 *
 * RFC 7807 shape:
 *   {
 *     type:     URI identifying the problem type (links to docs)
 *     title:    Short human-readable summary (doesn't change between occurrences)
 *     status:   HTTP status code
 *     detail:   Human-readable explanation of THIS occurrence
 *     instance: URI of the specific request that caused the problem
 *     code:     Machine-readable identifier (our extension)
 *     errors?:  Structured field-level details (our extension, for validation)
 *   }
 */

//  Success response 

export interface SuccessResponse<T> {
    success: true;
    data: T;
    meta?: Record<string, unknown>;
}

export function successResponse<T>(
    data: T,
    meta?: Record<string, unknown>,
): SuccessResponse<T> {
    return { success: true, data, ...(meta ? { meta } : {}) };
}

//  RFC 7807 Error response 

export interface ProblemDetails {
    success: false;
    type: string; // URI reference for the problem type
    title: string; // Short, stable summary of the problem type
    status: number; // HTTP status code
    detail: string; // Human-readable explanation of this occurrence
    instance: string; // URI of the request that triggered the error
    code: string; // Machine-readable error code (our extension)
    errors?: unknown; // Field-level validation errors (our extension)
}

/**
 * Builds an RFC 7807-compliant error response object.
 *
 * @param code     - Machine-readable error code (e.g. 'INSUFFICIENT_BALANCE')
 * @param title    - Short human-readable category (e.g. 'Unprocessable Entity')
 * @param detail   - Specific explanation for this occurrence
 * @param status   - HTTP status code
 * @param instance - Request path (req.path)
 * @param errors   - Optional structured field-level errors (Zod issues etc.)
 *
 * @example
 * res.status(422).json(
 *   errorResponse('INSUFFICIENT_BALANCE', 'Unprocessable Entity',
 *     'Required: 500, Available: 200', 422, '/api/orders')
 * )
 * // =>
 * // {
 * //   success: false,
 * //   type: "https://docs.ordersystem.dev/errors/INSUFFICIENT_BALANCE",
 * //   title: "Unprocessable Entity",
 * //   status: 422,
 * //   detail: "Required: 500, Available: 200",
 * //   instance: "/api/orders",
 * //   code: "INSUFFICIENT_BALANCE"
 * // }
 */
export function errorResponse(
    code: string,
    title: string,
    detail: string,
    status: number,
    instance: string,
    errors?: unknown,
): ProblemDetails {
    return {
        success: false,
        type: `https://docs.ordersystem.dev/errors/${code}`,
        title,
        status,
        detail,
        instance,
        code,
        ...(errors !== undefined ? { errors } : {}),
    };
}
