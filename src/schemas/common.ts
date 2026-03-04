/**
 * @module schemas/common
 * @description Shared Zod primitives reused across all feature schemas.
 *
 * Centralising these here means a change to e.g. the ID format
 * (switching from integer to UUID) only requires one edit, not
 * one per feature schema file.
 *
 * Naming convention:
 *   - `*Schema`       -> a Zod schema object
 *   - `*Input`        -> the inferred TypeScript type from a schema
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitive reusables
// ---------------------------------------------------------------------------

/**
 * Positive integer for database PKs.
 * Coerces string route params to number via z.coerce.number().
 *
 * Usage in route params: idParamSchema.parse(req.params)
 */
export const positiveInt = z
    .number({ error: "Must be a number" })
    .int("Must be an integer")
    .positive("Must be a positive integer");

/**
 * Coercing version - used for route params which arrive as strings.
 * e.g. /orders/42 -> req.params.id = "42" -> coerced to 42.
 */
export const coercedPositiveInt = z.coerce
    .number({ error: "Must be a number" })
    .int("Must be an integer")
    .positive("Must be a positive integer");

/**
 * Positive decimal for monetary amounts.
 * Enforces > 0 and at most 2 decimal places to match DECIMAL(14,2) in DB.
 */
export const positiveAmount = z
    .number({ error: "Must be a number" })
    .positive("Amount must be greater than zero")
    .refine(
        (v) => Number((v * 100).toFixed(0)) === Math.round(v * 100),
        "Amount must have at most 2 decimal places",
    );

// ---------------------------------------------------------------------------
// Route parameter schemas
// ---------------------------------------------------------------------------

/**
 * Schema for routes with a single `:id` param.
 * e.g. GET /orders/:id
 */
export const idParamSchema = z.object({
    id: z.uuid("Invalid ID format"), // UUID v4 format validation
});

/**
 * Schema for routes with a `:userId` param.
 * e.g. GET /orders/user/:userId
 */
export const userIdParamSchema = z.object({
    userId: z.uuid("Invalid user ID format"),
});

/**
 * Schema for routes with an `:orderNumber` param.
 * e.g. GET /orders/number/:orderNumber
 */
export const orderNumberParamSchema = z.object({
    orderNumber: z
        .string()
        .min(1, "Order number is required")
        .regex(
            /^ORD-\d{8}-\d{5}$/,
            "Order number must be in format ORD-YYYYMMDD-NNNNN",
        ),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type IdParam = z.infer<typeof idParamSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type OrderNumberParam = z.infer<typeof orderNumberParamSchema>;
