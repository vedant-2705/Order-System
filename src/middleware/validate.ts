/**
 * @module middleware/validate
 * @description Factory functions that produce Express middleware to validate
 * `req.body`, `req.params`, or `req.query` against a Zod schema.
 *
 * On success  : replaces the target property with the parsed (coerced) value
 *               and calls `next()` to continue the middleware chain.
 * On failure  : calls `next(zodError)` so the global `ErrorHandler` picks it
 *               up and returns an RFC 7807 422 response via `ZodErrorHelper`.
 *
 * Why replace rather than attach to a new property?
 *   Controllers read `req.body` / `req.params` / `req.query` directly.
 *   Replacing in-place means controllers receive the coerced, typed value
 *   (e.g. string "42" -> number 42 for coercedPositiveInt) without any
 *   extra casting or indirection.
 *
 * Usage in a route file:
 * ```ts
 * router.post(
 *   '/orders',
 *   validateBody(createOrderSchema),
 *   asyncHandler(orderController.create),
 * );
 *
 * router.get(
 *   '/orders/:id',
 *   validateParams(idParamSchema),
 *   asyncHandler(orderController.getById),
 * );
 * ```
 *
 * @see middleware/ErrorHandler.ts  for ZodError handling
 * @see helpers/errors/ZodErrorHelper.ts
 */
import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema } from "zod";

/**
 * Returns middleware that validates `req.body` against `schema`.
 * Replaces `req.body` with the parsed (coerced) result on success.
 *
 * @param schema - Any Zod schema; typically a `z.object({...})`.
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            next(result.error);
            return;
        }
        req.body = result.data;
        next();
    };
}

/**
 * Returns middleware that validates `req.params` against `schema`.
 * Replaces `req.params` with the parsed (coerced) result on success.
 *
 * @remarks
 * Particularly useful for coercing string route params to numbers:
 *   `/orders/42` -> `req.params.id = "42"` -> coerced to `42`
 *
 * @param schema - Typically a `z.object({ id: coercedPositiveInt })`.
 */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            next(result.error);
            return;
        }
        // Express types req.params as Record<string, string> - cast needed
        // because we're replacing it with the coerced (possibly numeric) result.
        (req as any).params = result.data;
        next();
    };
}

/**
 * Returns middleware that validates `req.query` against `schema`.
 * Replaces `req.query` with the parsed (coerced) result on success.
 *
 * @param schema - Typically a `z.object({ search: z.string().optional() })`.
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            next(result.error);
            return;
        }
        // Cast to any to assign to custom parsedQuery property
        (req as any).parsedQuery = result.data;
        next();
    };
}
