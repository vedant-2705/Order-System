/**
 * @module ZodErrorHelper
 * @description Response formatter for Zod schema validation errors.
 *
 * Converts a `ZodError` into an RFC 7807 response with a structured
 * `errors` field containing the prettified Zod issue list.
 *
 * Status code and title come from `ERROR_CODES.VALIDATION_FAILED` so
 * there are no magic numbers or strings in this file.
 *
 * @see constants/ErrorCodes.ts  for the VALIDATION_FAILED definition
 * @see helpers/ResponseHelper.ts for the RFC 7807 response shape
 */
import { Request, Response } from "express";
import z, { ZodError } from "zod";
import { ERROR_CODES } from "constants/ErrorCodes.js";
import { errorResponse } from "../ResponseHelper.js";

/**
 * Sends an RFC 7807 validation error response from a `ZodError`.
 *
 * @remarks
 * Uses `z.prettifyError()` to flatten the Zod issue tree into a
 * human-readable format that is forwarded to the client in the `errors` field.
 * The `title` and `statusCode` come from `ERROR_CODES.VALIDATION_FAILED`
 * so they stay consistent with all other error responses.
 *
 * @param err - The `ZodError` thrown by a schema `.parse()` call.
 * @param req - Express request  used for the `instance` (path) field.
 * @param res - Express response  the JSON response is written here.
 */
export function handleZodError(
    err: ZodError,
    req: Request,
    res: Response,
): void {
    const def = ERROR_CODES.VALIDATION_FAILED;

    const errors = z.prettifyError(err);

    res.status(def.statusCode).json(
        errorResponse(
            def.code,
            def.title,
            def.message,
            def.statusCode,
            req.path,
            errors,
        ),
    );
}
