/**
 * @module reports.routes
 * @description Express router for report endpoints.
 *
 *   GET /api/v1/reports/order-summary   ?from=&to=
 *   GET /api/v1/reports/revenue         ?from=&to=&group_by=day|month
 *   GET /api/v1/reports/top-customers   ?from=&to=&limit=10
 *   GET /api/v1/reports/top-products    ?from=&to=&limit=10
 *
 * All routes:
 *   - Require authentication (authMiddleware)
 *   - Restricted to admin role (requireRole)
 *   - Query params validated before reaching the controller (validateQuery)
 */
import { Router } from "express";
import { resolveController } from "config/di/container.js";
import { ReportController } from "./ReportController.js";
import { asyncHandler } from "middleware/AsyncHandler.js";
import { validateQuery } from "middleware/validate.js";
import { authMiddleware } from "middleware/authMiddleware.js";
import { requireRole } from "middleware/requireRole.js";
import {
    orderSummaryQuerySchema,
    revenueQuerySchema,
    topCustomersQuerySchema,
    topProductsQuerySchema,
} from "./schemas.js";

const router = Router();
const ctrl = resolveController(ReportController);

// All report routes require auth + admin role
router.use(authMiddleware, requireRole("admin"));

router.get(
    "/order-summary",
    validateQuery(orderSummaryQuerySchema),
    asyncHandler((req, res) => ctrl().orderSummary(req, res)),
);

router.get(
    "/revenue",
    validateQuery(revenueQuerySchema),
    asyncHandler((req, res) => ctrl().revenue(req, res)),
);

router.get(
    "/top-customers",
    validateQuery(topCustomersQuerySchema),
    asyncHandler((req, res) => ctrl().topCustomers(req, res)),
);

router.get(
    "/top-products",
    validateQuery(topProductsQuerySchema),
    asyncHandler((req, res) => ctrl().topProducts(req, res)),
);

export default router;
