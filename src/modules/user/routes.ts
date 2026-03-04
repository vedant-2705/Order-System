/**
 * @module user.routes
 * @description Express router for user endpoints.
 *
 *   POST   /api/v1/users/register   -> register   (public)
 *   POST   /api/v1/users/login      -> login      (public)
 *   GET    /api/v1/users            -> getAll     (admin only)
 *   GET    /api/v1/users/:id        -> getById    (auth required)
 *   PATCH  /api/v1/users/:id        -> update     (auth required)
 *   DELETE /api/v1/users/:id        -> delete     (admin only)
 *
 * "register" and "login" are registered before "/:id" to prevent Express
 * from treating them as id params.
 */
import { Router } from "express";
import { resolveController } from "config/di/container.js";
import { UserController } from "./UserController.js";
import { asyncHandler } from "middleware/AsyncHandler.js";
import { validateBody, validateParams } from "middleware/validate.js";
import { authMiddleware } from "middleware/authMiddleware.js";
import { requireRole } from "middleware/requireRole.js";
import { registerSchema, loginSchema, updateUserSchema } from "./schemas.js";
import { idParamSchema } from "schemas/common.js";
    
const router = Router();
const ctrl = resolveController(UserController);

// Public routes
router.post(
    "/register",
    validateBody(registerSchema),
    asyncHandler((req, res) => ctrl().register(req, res)),
);
router.post("/login", validateBody(loginSchema), asyncHandler((req, res) => ctrl().login(req, res)));

// Protected routes
router.get(
    "/",
    authMiddleware,
    requireRole("admin"),
    asyncHandler((req, res) => ctrl().getAll(req, res)),
);
router
    .route("/:id")
    .get(
        authMiddleware,
        validateParams(idParamSchema),
        asyncHandler((req, res) => ctrl().getById(req, res)),
    )
    .patch(
        authMiddleware,
        validateParams(idParamSchema),
        validateBody(updateUserSchema),
        asyncHandler((req, res) => ctrl().update(req, res)),
    )
    .delete(
        authMiddleware,
        requireRole("admin"),
        validateParams(idParamSchema),
        asyncHandler((req, res) => ctrl().delete(req, res)),
    );

export default router;
