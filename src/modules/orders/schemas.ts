/**
 * @module schemas/order.schemas
 * @description Zod validation schemas for all order-related HTTP requests.
 *
 * Inferred types (e.g. `CreateOrderInput`) are the single source of truth
 * for what the controller receives after validation.  The controller must
 * never read from `req.body` directly - only from the parsed result.
 *
 * Schema -> Controller -> UseCase flow:
 *   req.body  ->  validateBody(createOrderSchema)  ->  controller  ->  CreateOrderUseCase
 *
 * Why validate userId in the body rather than a JWT claim?
 *   Auth middleware is not yet implemented.  Once JWT auth is added,
 *   userId will be extracted from req.user and this field removed from
 *   the request body.  The schema is designed to make that migration easy.
 */
import { z } from "zod";
import { positiveInt } from "schemas/common.js";

// ---------------------------------------------------------------------------
// POST /api/v1/orders
// ---------------------------------------------------------------------------

/**
 * A single line item in a create-order request.
 * product_id and quantity are the only client-supplied fields.
 * Price is always read from the DB (locked row) - never trusted from client.
 */
const orderItemSchema = z.object({
    product_id: positiveInt.describe("Internal product ID"),
    quantity: positiveInt
        .max(9999, "Quantity cannot exceed 9999 per line item")
        .describe("Number of units to order"),
});

/**
 * Full schema for creating an order.
 *
 * Constraints:
 *   - items must have at least one entry
 *   - duplicate product_ids are allowed (e.g. two separate line items for same product)
 *     - the use case merges or handles as separate lines
 *   - notes is optional and capped to prevent large payloads
 */
export const createOrderSchema = z.object({
    items: z
        .array(orderItemSchema)
        .min(1, "Order must contain at least one item")
        .max(50, "Order cannot contain more than 50 line items"),

    notes: z
        .string()
        .max(1000, "Notes cannot exceed 1000 characters")
        .optional(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/orders/:id  - handled by idParamSchema from common
// GET /api/v1/orders/user/:userId  - handled by userIdParamSchema from common
// GET /api/v1/orders/number/:orderNumber  - handled by orderNumberParamSchema from common
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

/** Validated body shape for POST /api/v1/orders */
export type CreateOrderBody = z.infer<typeof createOrderSchema>;
