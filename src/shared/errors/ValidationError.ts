import { AppError } from "./AppError.js";

/**
 * HTTP 422 — request body is valid JSON but fails schema/business validation.
 * details carries field-level Zod issues for the client.
 * @example throw new ValidationError(zodError.flatten())
 */
export class ValidationError extends AppError {
    constructor(details?: unknown) {
        super("VALIDATION_FAILED", {}, details);
    }
}
