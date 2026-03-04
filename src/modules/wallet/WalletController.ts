/**
 * @module WalletController
 * @description HTTP layer for wallet operations.
 *
 * Responsibilities:
 *   - Forward validated request data to use cases
 *   - Shape results into HTTP responses via `successResponse()`
 *   - Delegate all error handling to the global `ErrorHandler`
 *
 * All methods are bound arrow functions so they can be passed directly
 * to `router.post(path, asyncHandler(controller.topUp))` without losing `this`.
 *
 * Route map (registered in wallet.routes.ts):
 *   POST   /api/v1/wallet/topup              -> topUp
 *   GET    /api/v1/wallet/:userId/history    -> getHistory
 *   GET    /api/v1/wallet/:userId            -> getByUserId
 *
 * Note: /topup and /:userId/history are registered BEFORE /:userId to
 * prevent Express matching "topup" as a :userId param.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { TopUpWalletUseCase } from "./use-cases/TopUpWalletUseCase.js";
import { GetWalletUseCase } from "./use-cases/GetWalletUseCase.js";
import { TopUpBody } from "./schemas.js";
import { UserIdParam } from "schemas/common.js";

@injectable()
export class WalletController {
    constructor(
        @inject(TopUpWalletUseCase)
        private readonly topUpWalletUseCase: TopUpWalletUseCase,

        @inject(GetWalletUseCase)
        private readonly getWalletUseCase: GetWalletUseCase,
    ) {}

    /**
     * POST /api/v1/wallet/topup
     *
     * Credits a user's wallet with the given amount and records a ledger entry.
     * req.body is pre-validated by validateBody(topUpSchema).
     * Responds 200 with the updated wallet and the ledger transaction.
     */
    topUp = async (req: Request, res: Response): Promise<void> => {
        const body = req.body as TopUpBody;

        const result = await this.topUpWalletUseCase.execute({
            userId: body.userId,
            amount: body.amount,
            description: body.description,
        });

        res.status(StatusCodes.OK).json(
            successResponse(
                {
                    wallet: result.wallet,
                    transaction: result.transaction,
                },
                { timestamp: new Date().toISOString() },
            ),
        );
    };

    /**
     * GET /api/v1/wallet/:userId
     *
     * Returns the wallet for a user (balance only - no transaction history).
     * req.params.userId is pre-validated and coerced by validateParams(userIdParamSchema).
     * Responds 200 with the wallet row, or 404 if not found.
     */
    getByUserId = async (req: Request, res: Response): Promise<void> => {
        const { userId } = req.params as unknown as UserIdParam;

        const wallet = await this.getWalletUseCase.getByUserId(userId);

        res.status(StatusCodes.OK).json(successResponse(wallet));
    };

    /**
     * GET /api/v1/wallet/:userId/history
     *
     * Returns the wallet alongside its full transaction ledger, newest first.
     * Used for the wallet statement / detail page.
     * Responds 200 with wallet + transactions array, or 404 if not found.
     */
    getHistory = async (req: Request, res: Response): Promise<void> => {
        const { userId } = req.params as unknown as UserIdParam;

        const result = await this.getWalletUseCase.getWithHistory(userId);

        res.status(StatusCodes.OK).json(
            successResponse(result, {
                transactionCount: result.transactions.length,
            }),
        );
    };
}
