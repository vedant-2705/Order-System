/**
 * @module AsyncHandler
 * @description Utility wrapper that forwards unhandled promise rejections from async
 * route handlers to Express's `next(err)` error pipeline.
 * Without this, rejected promises in async handlers would be unhandled and crash the process
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Wraps an async route handler so that any thrown error or rejected promise
 * is automatically forwarded to the next error-handling middleware.
 *
 * @param fn - Async route handler to wrap
 * @returns A standard Express middleware function with error forwarding
 *
 * @example
 * router.get("/", asyncHandler(async (req, res) => {
 *     const data = await someService.getData();
 *     res.json(data);
 * }));
 */
export const asyncHandler = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
