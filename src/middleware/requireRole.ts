/**
 * @module requireRole
 * @description Factory middleware that restricts a route to specific user roles.
 *
 * Must be used AFTER authMiddleware (which sets req.user).
 * Throws ForbiddenError (403) if the authenticated user's role is not
 * in the allowed list.
 *
 * Usage:
 *   router.post('/products', authMiddleware, requireRole('admin'), asyncHandler(handler))
 *   router.get('/orders',    authMiddleware, requireRole('admin', 'customer'), asyncHandler(handler))
 */
import { Request, Response, NextFunction, RequestHandler } from "express";
import { ForbiddenError } from "shared/errors/ForbiddenError.js";
import { UserType } from "modules/user/types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

/**
 * Returns Express middleware that allows only the specified roles.
 *
 * @param roles - One or more UserType values that are permitted.
 * @returns RequestHandler that calls next() if allowed, next(ForbiddenError) if not.
 */
export function requireRole(...roles: UserType[]): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const userRole = req.user?.role;

        if (!userRole || !roles.includes(userRole)) {
            return next(new ForbiddenError(ErrorKeys.INSUFFICIENT_PERMISSIONS));
        }

        next();
    };
}
