/**
 * @module schemas/wallet.schemas
 * @description Zod validation schemas for all wallet-related HTTP requests.
 *
 * Schema -> Controller -> UseCase flow:
 *   req.body  ->  validateBody(topUpSchema)  ->  WalletController  ->  TopUpWalletUseCase
 */
import { z } from "zod";
import { positiveInt, positiveAmount } from "schemas/common.js";

// ---------------------------------------------------------------------------
// POST /api/v1/wallet/topup
// ---------------------------------------------------------------------------

/**
 * Schema for crediting a wallet.
 *
 * Constraints:
 *   - userId must be a positive integer
 *   - amount must be > 0 and have at most 2 decimal places
 *   - description is optional; capped to match DB column size
 *
 * Once auth middleware is added, userId will move from the body
 * to req.user.id and this field will be removed.
 */
export const topUpSchema = z.object({
    userId: positiveInt.describe("ID of the user whose wallet to credit"),

    amount: positiveAmount.describe(
        "Amount to add to the wallet (must be > 0, max 2 decimal places)",
    ),

    description: z
        .string()
        .max(500, "Description cannot exceed 500 characters")
        .optional(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/wallet/:userId  - handled by userIdParamSchema from common
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

/** Validated body shape for POST /api/v1/wallet/topup */
export type TopUpBody = z.infer<typeof topUpSchema>;
