/**
 * @module wallet.routes
 * @description Express router for wallet endpoints.
 *
 *   POST   /api/v1/wallet/topup           -> topUp        (admin only — manual credit)
 *   GET    /api/v1/wallet/:userId/history -> getHistory   (auth required)
 *   GET    /api/v1/wallet/:userId         -> getByUserId  (auth required)
 *
 * "topup" and ":userId/history" registered BEFORE "/:userId" to prevent
 * Express matching "topup" as a userId param.
 */
import { Router } from "express";
import { resolveController } from "config/di/container.js";
import { WalletController } from "./WalletController.js";
import { asyncHandler } from "middleware/AsyncHandler.js";
import { validateBody, validateParams } from "middleware/validate.js";
import { authMiddleware } from "middleware/authMiddleware.js";
import { requireRole } from "middleware/requireRole.js";
import { topUpSchema } from "./schemas.js";
import { userIdParamSchema } from "schemas/common.js";

const router = Router();
const ctrl = resolveController(WalletController);

router.use(authMiddleware);

// Admin: credit a wallet manually
router.post(
    "/topup",
    requireRole("admin"),
    validateBody(topUpSchema),
    asyncHandler((req, res) => ctrl().topUp(req, res)),
);

// Any authenticated user (controller should verify they own the wallet or is admin)
router.get(
    "/:userId/history",
    validateParams(userIdParamSchema),
    asyncHandler((req, res) => ctrl().getHistory(req, res)),
);
router.get(
    "/:userId",
    validateParams(userIdParamSchema),
    asyncHandler((req, res) => ctrl().getByUserId(req, res)),
);

export default router;
