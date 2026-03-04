/**
 * @module authMiddleware
 * @description Verifies the Bearer JWT on incoming requests and attaches
 * the decoded payload to `req.user`.
 *
 * On failure throws UnauthorizedError (401) which flows to the global
 * ErrorHandler via next(err).
 *
 * Usage:
 *   router.get('/protected', authMiddleware, asyncHandler(handler))
 *
 * Public routes (login, register) must NOT have this middleware.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "shared/errors/UnauthorizedError.js";
import { ErrorKeys } from "constants/ErrorCodes.js";
import { UserType } from "modules/user/types.js";

interface JwtPayload {
    sub: string;
    role: UserType;
}

/**
 * Extracts and verifies the Bearer token from the Authorization header.
 * Attaches `{ id, role }` to `req.user` on success.
 * Calls `next(UnauthorizedError)` on any failure.
 */
export function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return next(new UnauthorizedError(ErrorKeys.INVALID_TOKEN));
    }

    const token = authHeader.slice(7); // strip "Bearer "

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return next(new Error("JWT_SECRET environment variable is not set"));
    }

    try {
        const payload = jwt.verify(token, secret) as unknown as JwtPayload;
        req.user = { id: payload.sub, role: payload.role };
        next();
    } catch {
        next(new UnauthorizedError(ErrorKeys.INVALID_TOKEN));
    }
}
