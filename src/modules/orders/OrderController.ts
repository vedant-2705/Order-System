/**
 * @module OrderController
 * @description HTTP layer for order operations.
 *
 * Responsibilities:
 *   - Parse and forward validated request data to use cases
 *   - Shape use-case results into HTTP responses via `successResponse()`
 *   - Delegate all error handling to the global `ErrorHandler` (via `asyncHandler`)
 *
 * The controller never contains business logic. It only:
 *   1. Reads from validated `req.body` / `req.params`
 *   2. Calls the appropriate use case
 *   3. Sends a consistent success response
 *
 * All methods are bound arrow functions so they can be passed directly to
 * `router.post(path, asyncHandler(controller.create))` without losing `this`.
 *
 * Route map (registered in order.routes.ts):
 *   POST   /api/v1/orders                           -> create
 *   GET    /api/v1/orders/user/:userId              -> getByUserId
 *   GET    /api/v1/orders/number/:orderNumber       -> getByOrderNumber
 *   GET    /api/v1/orders/:id                       -> getById
 *
 * Note: specific routes (user/, number/) are registered BEFORE /:id to
 * prevent Express matching "user" or "number" as an :id param.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { CreateOrderUseCase } from "./use-cases/CreateOrderUseCase.js";
import { GetOrderUseCase } from "./use-cases/GetOrderUseCase.js";
import { CreateOrderBody } from "./schemas.js";
import { IdParam, UserIdParam, OrderNumberParam } from "schemas/common.js";

@injectable()
export class OrderController {
    constructor(
        @inject(CreateOrderUseCase)
        private readonly createOrderUseCase: CreateOrderUseCase,

        @inject(GetOrderUseCase)
        private readonly getOrderUseCase: GetOrderUseCase,
    ) {}

    /**
     * POST /api/v1/orders
     *
     * Creates a new order for a user.
     * req.body is pre-validated by validateBody(createOrderSchema).
     * Responds 201 with the created order and its line items.
     */
    create = async (req: Request, res: Response): Promise<void> => {
        const body = req.body as CreateOrderBody;

        const result = await this.createOrderUseCase.execute({
            userId: body.userId,
            items: body.items,
            notes: body.notes,
        });

        res.status(StatusCodes.CREATED).json(
            successResponse(
                {
                    order: result.order,
                    items: result.items,
                },
                { timestamp: new Date().toISOString() },
            ),
        );
    };

    /**
     * GET /api/v1/orders/:id
     *
     * Fetches a single order by its internal PK, including line items.
     * req.params.id is pre-validated and coerced to number by validateParams(idParamSchema).
     * Responds 200 with the order and its items, or 404 if not found.
     */
    getById = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;

        const result = await this.getOrderUseCase.getById(id);

        res.status(StatusCodes.OK).json(successResponse(result));
    };

    /**
     * GET /api/v1/orders/number/:orderNumber
     *
     * Fetches a single order by its human-readable order number (ORD-YYYYMMDD-NNNNN).
     * req.params.orderNumber is pre-validated by validateParams(orderNumberParamSchema).
     * Responds 200 with the order and its items, or 404 if not found.
     */
    getByOrderNumber = async (req: Request, res: Response): Promise<void> => {
        const { orderNumber } = req.params as unknown as OrderNumberParam;

        const result = await this.getOrderUseCase.getByOrderNumber(orderNumber);

        res.status(StatusCodes.OK).json(successResponse(result));
    };

    /**
     * GET /api/v1/orders/user/:userId
     *
     * Returns all active orders for a user, newest first.
     * Returns the order list only - no line items (list view).
     * Line items are fetched on demand via GET /orders/:id.
     */
    getByUserId = async (req: Request, res: Response): Promise<void> => {
        const { userId } = req.params as unknown as UserIdParam;

        const orders = await this.getOrderUseCase.getByUserId(userId);

        res.status(StatusCodes.OK).json(
            successResponse(orders, { count: orders.length }),
        );
    };
}
