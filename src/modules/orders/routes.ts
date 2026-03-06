/**
 * @module order.routes
 * @description Express router for order endpoints.
 *
 *   POST   /api/v1/orders                       -> create           (auth + rate limited + idempotent)
 *   GET    /api/v1/orders/user/:userId          -> getByUserId      (auth + rate limited)
 *   GET    /api/v1/orders/number/:orderNumber   -> getByOrderNumber (auth + rate limited)
 *   PATCH  /api/v1/orders/:id/cancel            -> cancel           (auth + rate limited)
 *   GET    /api/v1/orders/:id                   -> getById          (auth + rate limited)
 *
 * Specific routes ("user/", "number/", ":id/cancel") registered BEFORE "/:id"
 * so Express doesn't match "user" or "number" as an id param.
 *
 * Middleware order on POST /:
 *   authMiddleware (router.use)
 *     -> apiRateLimit (router.use)
 *       -> validateBody(createOrderSchema)
 *         -> idempotencyMiddleware()   <- MUST be after auth (needs req.user.id)
 *           -> controller
 *
 * Why idempotency after validateBody?
 *   validateBody rejects malformed JSON before we touch Redis at all.
 *   A 422 from schema validation is never stored - idempotency only
 *   applies to structurally valid requests that reach the use case.
 */
import { Router } from "express";
import { resolveController } from "config/di/container.js";
import { OrderController } from "./OrderController.js";
import { asyncHandler } from "middleware/AsyncHandler.js";
import { validateBody, validateParams } from "middleware/validate.js";
import { authMiddleware } from "middleware/authMiddleware.js";
import { apiRateLimit } from "middleware/RateLimitMiddleware.js";
import { idempotencyMiddleware } from "middleware/IdempotencyMiddleware.js";
import { createOrderSchema } from "./schemas.js";
import {
    idParamSchema,
    userIdParamSchema,
    orderNumberParamSchema,
} from "schemas/common.js";

const router = Router();
const ctrl = resolveController(OrderController);

// All order routes require authentication and are rate limited
router.use(authMiddleware, apiRateLimit);

router.post(
    "/",
    validateBody(createOrderSchema),
    idempotencyMiddleware(), // after auth (req.user.id available) + after validateBody (only valid requests stored)
    asyncHandler((req, res) => ctrl().create(req, res)),
);
router.get(
    "/user/:userId",
    validateParams(userIdParamSchema),
    asyncHandler((req, res) => ctrl().getByUserId(req, res)),
);
router.get(
    "/number/:orderNumber",
    validateParams(orderNumberParamSchema),
    asyncHandler((req, res) => ctrl().getByOrderNumber(req, res)),
);
router.patch(
    "/:id/cancel",
    validateParams(idParamSchema),
    asyncHandler((req, res) => ctrl().cancel(req, res)),
);
router.get(
    "/:id",
    validateParams(idParamSchema),
    asyncHandler((req, res) => ctrl().getById(req, res)),
);

export default router;
