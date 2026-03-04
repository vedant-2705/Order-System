/**
 * @module ReportController
 * @description HTTP layer for report endpoints.
 *
 * Route map (all admin-only):
 *   GET /api/v1/reports/order-summary   -> orderSummary
 *   GET /api/v1/reports/revenue         -> revenue
 *   GET /api/v1/reports/top-customers   -> topCustomers
 *   GET /api/v1/reports/top-products    -> topProducts
 *
 * Each handler is a thin adapter: extract validated parsedQuery params,
 * call the use case, wrap in successResponse. No business logic here.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { GetOrderSummaryUseCase } from "./use-cases/GetOrderSumaryuseCase.js";
import { GetRevenueReportUseCase } from "./use-cases/GetRevenueReportUseCase.js";
import { GetTopCustomersUseCase } from "./use-cases/GetTopCustomersUseCase.js";
import {
    OrderSummaryQuery,
    RevenueQuery,
    TopCustomersQuery,
    TopProductsQuery,
} from "./schemas.js";
import { GetTopProductsUseCase } from "./use-cases/GetTopProductUseCase.js";

@injectable()
export class ReportController {
    constructor(
        @inject(GetOrderSummaryUseCase)
        private readonly orderSummaryUseCase: GetOrderSummaryUseCase,

        @inject(GetRevenueReportUseCase)
        private readonly revenueUseCase: GetRevenueReportUseCase,

        @inject(GetTopCustomersUseCase)
        private readonly topCustomersUseCase: GetTopCustomersUseCase,

        @inject(GetTopProductsUseCase)
        private readonly topProductsUseCase: GetTopProductsUseCase,
    ) {}

    orderSummary = async (req: Request, res: Response): Promise<void> => {
        const { from, to } = (req as any).parsedQuery as OrderSummaryQuery;
        console.log("From Report Controller", from, to);
        const report = await this.orderSummaryUseCase.execute({ from, to });
        res.status(StatusCodes.OK).json(successResponse(report));
    };

    revenue = async (req: Request, res: Response): Promise<void> => {
        const { from, to, group_by } = (req as any).parsedQuery as RevenueQuery;
        const report = await this.revenueUseCase.execute({
            from,
            to,
            group_by,
        });
        res.status(StatusCodes.OK).json(successResponse(report));
    };

    topCustomers = async (req: Request, res: Response): Promise<void> => {
        const { from, to, limit } = (req as any).parsedQuery as TopCustomersQuery;
        const report = await this.topCustomersUseCase.execute({
            from,
            to,
            limit,
        });
        res.status(StatusCodes.OK).json(successResponse(report));
    };

    topProducts = async (req: Request, res: Response): Promise<void> => {
        const { from, to, limit } = (req as any).parsedQuery as TopProductsQuery;
        const report = await this.topProductsUseCase.execute({
            from,
            to,
            limit,
        });
        res.status(StatusCodes.OK).json(successResponse(report));
    };
}
