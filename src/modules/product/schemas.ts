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
// Inferred types
// ---------------------------------------------------------------------------

/** Validated query shape for GET /api/v1/products */
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
