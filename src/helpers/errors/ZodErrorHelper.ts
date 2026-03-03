import { Request, Response } from "express";
import z, { ZodError } from "zod";
import { ERROR_CODES } from "constants/ErrorCodes.js";
import { errorResponse } from "../ResponseHelper.js";

/**
 * Title and statusCode come from ERROR_CODES  no magic strings.
 * Zod issues are flattened to { field: message } for the client.
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
