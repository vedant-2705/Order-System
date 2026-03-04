/**
 * @module product.routes
 * @description Express router for product endpoints.
 *
 *   GET    /api/v1/products          -> getAll    (public)
 *   GET    /api/v1/products/:id      -> getById   (public)
 *   POST   /api/v1/products          -> create    (admin only)
 *   PATCH  /api/v1/products/:id      -> update    (admin only)
 *   DELETE /api/v1/products/:id      -> delete    (admin only)
 */
import { Router } from "express";
import { resolveController } from "config/di/container.js";
import { ProductController } from "./ProductController.js";
import { asyncHandler } from "middleware/AsyncHandler.js";
import {
    validateBody,
    validateParams,
    validateQuery,
} from "middleware/validate.js";
import { authMiddleware } from "middleware/authMiddleware.js";
import { requireRole } from "middleware/requireRole.js";
import {
    createProductSchema,
    updateProductSchema,
    listProductsQuerySchema,
} from "./schemas.js";
import { idParamSchema } from "schemas/common.js";

const router = Router();
const ctrl = resolveController(ProductController);

// Public reads
router.get(
    "/",
    validateQuery(listProductsQuerySchema),
    asyncHandler((req, res) => ctrl().getAll(req, res)),
);
router.get("/:id", validateParams(idParamSchema), asyncHandler((req, res) => ctrl().getById(req, res)));

// Admin writes
router.post(
    "/",
    authMiddleware,
    requireRole("admin"),
    validateBody(createProductSchema),
    asyncHandler((req, res) => ctrl().create(req, res)),
);

router
    .route("/:id")
    .patch(
        authMiddleware,
        requireRole("admin"),
        validateParams(idParamSchema),
        validateBody(updateProductSchema),
        asyncHandler((req, res) => ctrl().update(req, res)),
    )
    .delete(
        authMiddleware,
        requireRole("admin"),
        validateParams(idParamSchema),
        asyncHandler((req, res) => ctrl().delete(req, res)),
    );

export default router;
