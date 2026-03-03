import { Request, Response } from "express";
import { AppError } from "shared/errors/AppError.js";
import { errorResponse } from "../ResponseHelper.js";

/**
 * AppError already carries title and statusCode from ERROR_CODES
 * (set in the AppError constructor). No lookup needed here 
 * just read them off the error instance.
 */
export function handleAppError(
    err: AppError,
    req: Request,
    res: Response,
): void {
    res.status(err.statusCode).json(
        errorResponse(
            err.code,
            err.title,
            err.message,
            err.statusCode,
            req.path,
            err.details,
        ),
    );
}
