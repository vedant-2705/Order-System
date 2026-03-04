/**
 * @module schemas/product.schemas
 * @description Zod validation schemas for all product-related HTTP requests.
 *
 * Currently covers read operations only.
 * Write operations (create, update, delete) will be added when
 * ProductUseCase and admin routes are built.
 *
 * Schema -> Controller -> UseCase flow:
 *   req.params  ->  validateParams(idParamSchema)  ->  ProductController  ->  ProductRepository
 */
import { positiveAmount } from "schemas/common.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /api/v1/products         - no query schema needed (returns all active)
// GET /api/v1/products/:id     - handled by idParamSchema from common
// ---------------------------------------------------------------------------

/**
 * Optional query parameters for GET /api/v1/products.
 * Allows filtering the active product list by name substring.
 */
export const listProductsQuerySchema = z.object({
    search: z
        .string()
        .max(200, "Search term cannot exceed 200 characters")
        .optional()
        .describe("Optional name filter (case-insensitive substring match)"),
});

// ---------------------------------------------------------------------------
// POST /api/v1/products
// ---------------------------------------------------------------------------
export const createProductSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().max(2000).optional(),
    price: positiveAmount.describe(
        "Unit price - must be > 0, max 2 decimal places",
    ),
    sku: z
        .string()
        .min(1, "SKU is required")
        .max(100)
        .regex(
            /^[A-Za-z0-9_-]+$/,
            "SKU may only contain letters, numbers, hyphens, underscores",
        ),
    stock: z
        .number()
        .int()
        .min(0, "Stock cannot be negative")
        .optional()
        .default(0),
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/products/:id
// ---------------------------------------------------------------------------
export const updateProductSchema = z
    .object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        price: positiveAmount.optional(),
        sku: z
            .string()
            .min(1)
            .max(100)
            .regex(/^[A-Za-z0-9_-]+$/)
            .optional(),
        stock: z.number().int().min(0).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, {
        message: "At least one field must be provided",
    });

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
