/**
 * @module ValidationError
 * @description HTTP 422 Unprocessable Entity error.
 * Thrown when the request body is syntactically valid JSON but fails schema
 * or business-rule validation (typically from a Zod `safeParse` failure).
 */
import { AppError } from "./AppError.js";

/**
 * HTTP 422  request body is valid JSON but fails schema validation.
 *
 * @remarks
 * The `details` field carries the structured Zod issue list that is
 * forwarded to the client in the RFC 7807 `errors` extension field.
 *
 * @example
 * const result = schema.safeParse(req.body);
 * if (!result.success) throw new ValidationError(result.error.flatten());
 */
export class ValidationError extends AppError {
    constructor(details?: unknown) {
        super("VALIDATION_FAILED", {}, details);
    }
}
