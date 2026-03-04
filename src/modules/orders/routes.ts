/**
 * @module order.routes
 * @description Express router for order endpoints.
 *
 *   POST   /api/v1/orders                      -> create           (auth required)
 *   GET    /api/v1/orders/user/:userId          -> getByUserId      (auth required)
 *   GET    /api/v1/orders/number/:orderNumber   -> getByOrderNumber (auth required)
 *   PATCH  /api/v1/orders/:id/cancel           -> cancel           (auth required)
 *   GET    /api/v1/orders/:id                   -> getById          (auth required)
 *
 * Specific routes ("user/", "number/", ":id/cancel") registered BEFORE "/:id"
 * so Express doesn't match "user" or "number" as an id param.
 */
import { Router } from "express";
import { resolveController } from "config/di/container.js";
import { OrderController } from "./OrderController.js";
import { asyncHandler } from "middleware/AsyncHandler.js";
import { validateBody, validateParams } from "middleware/validate.js";
import { authMiddleware } from "middleware/authMiddleware.js";
import { createOrderSchema } from "./schemas.js";
import {
    idParamSchema,
    userIdParamSchema,
    orderNumberParamSchema,
} from "schemas/common.js";

const router = Router();
const ctrl = resolveController(OrderController);

// All order routes require authentication
router.use(authMiddleware);

router.post("/", validateBody(createOrderSchema), asyncHandler((req, res) => ctrl().create(req, res)));
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
router.get("/:id", validateParams(idParamSchema), asyncHandler((req, res) => ctrl().getById(req, res)));

export default router;
