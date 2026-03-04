/**
 * @module OrderController
 * @description HTTP layer for order operations.
 *
 * Route map:
 *   POST   /api/v1/orders                           -> create
 *   GET    /api/v1/orders/user/:userId              -> getByUserId
 *   GET    /api/v1/orders/number/:orderNumber       -> getByOrderNumber
 *   GET    /api/v1/orders/:id                       -> getById
 *   PATCH  /api/v1/orders/:id/cancel               -> cancel
 *
 * Note: specific routes registered BEFORE /:id to prevent Express matching
 * "user", "number" as an :id param.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { CreateOrderUseCase } from "./use-cases/CreateOrderUseCase.js";
import { GetOrderUseCase } from "./use-cases/GetOrderUseCase.js";
import { CancelOrderUseCase } from "./use-cases/CancelOrderUseCase.js";
import { CreateOrderBody } from "./schemas.js";
import { IdParam, UserIdParam, OrderNumberParam } from "schemas/common.js";

@injectable()
export class OrderController {
    constructor(
        @inject(CreateOrderUseCase)
        private readonly createOrderUseCase: CreateOrderUseCase,

        @inject(GetOrderUseCase)
        private readonly getOrderUseCase: GetOrderUseCase,

        @inject(CancelOrderUseCase)
        private readonly cancelOrderUseCase: CancelOrderUseCase,
    ) {}

    /**
     * POST /api/v1/orders
     * userId comes from req.user (set by authMiddleware).
     */
    create = async (req: Request, res: Response): Promise<void> => {
        const body = req.body as CreateOrderBody;

        // userId from auth token, not body
        const userId = req.user!.id;

        const result = await this.createOrderUseCase.execute({
            userId,
            items: body.items,
            notes: body.notes,
        });

        res.status(StatusCodes.CREATED).json(
            successResponse(
                { order: result.order, items: result.items },
                { timestamp: new Date().toISOString() },
            ),
        );
    };

    getById = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        const result = await this.getOrderUseCase.getById(id);
        res.status(StatusCodes.OK).json(successResponse(result));
    };

    getByOrderNumber = async (req: Request, res: Response): Promise<void> => {
        const { orderNumber } = req.params as unknown as OrderNumberParam;
        const result = await this.getOrderUseCase.getByOrderNumber(orderNumber);
        res.status(StatusCodes.OK).json(successResponse(result));
    };

    getByUserId = async (req: Request, res: Response): Promise<void> => {
        const { userId } = req.params as unknown as UserIdParam;
        const orders = await this.getOrderUseCase.getByUserId(userId);
        res.status(StatusCodes.OK).json(
            successResponse(orders, { count: orders.length }),
        );
    };

    /**
     * PATCH /api/v1/orders/:id/cancel
     * Cancels the order and refunds the wallet.
     */
    cancel = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        const requestingUserId = req.user!.id;

        const result = await this.cancelOrderUseCase.execute(
            id,
            requestingUserId,
        );

        res.status(StatusCodes.OK).json(
            successResponse(
                { order: result.order, refundAmount: result.refundAmount },
                { timestamp: new Date().toISOString() },
            ),
        );
    };
}
