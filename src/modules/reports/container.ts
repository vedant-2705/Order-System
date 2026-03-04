/**
 * @module reports/container
 * @description Registers report module dependencies into the tsyringe container.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { ReportRepository } from "./ReportRepository.js";
import { ReportController } from "./ReportController.js";
import { GetOrderSummaryUseCase } from "./use-cases/GetOrderSumaryuseCase.js";
import { GetRevenueReportUseCase } from "./use-cases/GetRevenueReportUseCase.js";
import { GetTopCustomersUseCase } from "./use-cases/GetTopCustomersUseCase.js";
import { GetTopProductsUseCase } from "./use-cases/GetTopProductUseCase.js";

export function registerReportModule(): void {
    container.registerSingleton(ReportRepository);
    container.registerSingleton(GetOrderSummaryUseCase);
    container.registerSingleton(GetRevenueReportUseCase);
    container.registerSingleton(GetTopCustomersUseCase);
    container.registerSingleton(GetTopProductsUseCase);
    container.registerSingleton(ReportController);
}
