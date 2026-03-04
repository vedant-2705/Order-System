/**
 * @module reports/schemas
 * @description Zod validation schemas for each report endpoint's query params.
 *
 * Each report has its own schema because each has different valid params:
 *   order-summary  -> from, to
 *   revenue        -> from, to, group_by (day|month)
 *   top-customers  -> from, to, limit (1-100)
 *   top-products   -> from, to, limit (1-100)
 */
import { z } from "zod";

//  Shared primitives 

/**
 * Validates an ISO date string (YYYY-MM-DD).
 * Optional - all date params are optional on every report endpoint.
 */
const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((d) => !isNaN(Date.parse(d)), "Must be a valid calendar date")
    .optional();

/**
 * Base date range object shared across all schemas.
 * The .refine() at the end catches from > to (logically impossible range).
 */
const dateRange = z
    .object({ from: isoDate, to: isoDate })
    .refine(
        ({ from, to }) => !(from && to) || new Date(from) <= new Date(to),
        { message: "'from' must be before or equal to 'to'", path: ["from"] },
    );

//  Per-endpoint schemas 

/** GET /api/v1/reports/order-summary */
export const orderSummaryQuerySchema = dateRange;

/** GET /api/v1/reports/revenue */
export const revenueQuerySchema = dateRange.and(
    z.object({
        group_by: z
            .enum(["day", "month"], {
                error: "group_by must be 'day' or 'month'",
            })
            .optional()
            .default("day"),
    }),
);

/** GET /api/v1/reports/top-customers */
export const topCustomersQuerySchema = dateRange.and(
    z.object({
        limit: z.coerce
            .number()
            .int("limit must be an integer")
            .min(1, "limit must be at least 1")
            .max(100, "limit cannot exceed 100")
            .optional()
            .default(10),
    }),
);

/** GET /api/v1/reports/top-products */
export const topProductsQuerySchema = dateRange.and(
    z.object({
        limit: z.coerce
            .number()
            .int("limit must be an integer")
            .min(1, "limit must be at least 1")
            .max(100, "limit cannot exceed 100")
            .optional()
            .default(10),
    }),
);

//  Inferred types 

export type OrderSummaryQuery  = z.infer<typeof orderSummaryQuerySchema>;
export type RevenueQuery       = z.infer<typeof revenueQuerySchema>;
export type TopCustomersQuery  = z.infer<typeof topCustomersQuerySchema>;
export type TopProductsQuery   = z.infer<typeof topProductsQuerySchema>;