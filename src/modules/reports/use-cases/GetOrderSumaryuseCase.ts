/**
 * @module use-cases/index
 * @description Four report use cases - one per endpoint.
 *
 * Each is a thin orchestration layer between the controller and repository.
 * They exist for:
 *   - Consistent layering (controllers never call repos directly)
 *   - Business logic that belongs here, not in SQL (totals computation,
 *     default values, input clamping)
 *   - A natural place to add caching per-report without touching controllers
 *
 * All four are in one file because they are small and tightly related.
 * If any grows significantly, split into separate files.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { ReportRepository } from "../ReportRepository.js";
import {
    DateRangeFilter,
    OrderSummaryReport,
} from "../types.js";
import { meta } from "helpers/dateRange.js";


@injectable()
export class GetOrderSummaryUseCase {
    constructor(
        @inject(ReportRepository)
        private readonly repo: ReportRepository,
        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(filters: DateRangeFilter): Promise<OrderSummaryReport> {
        this.logger.info("[Report:OrderSummary] Generating", filters);

        const breakdown = await this.repo.getOrderSummary(filters);

        // Compute overall totals from the returned rows - no extra DB query needed.
        // Only count non-cancelled/refunded orders in revenue totals.
        const revenueStatuses = new Set([
            "pending",
            "confirmed",
            "processing",
            "completed",
        ]);
        const revenueRows = breakdown.filter((r) =>
            revenueStatuses.has(r.status),
        );

        const total_orders = breakdown.reduce((s, r) => s + r.order_count, 0);
        const total_revenue = revenueRows.reduce(
            (s, r) => s + Number(r.total_revenue),
            0,
        );
        const avg_order_value =
            revenueRows.length > 0
                ? revenueRows.reduce(
                      (s, r) => s + Number(r.avg_order_value),
                      0,
                  ) / revenueRows.length
                : 0;

        return {
            ...meta(filters),
            breakdown,
            totals: {
                total_orders,
                total_revenue: Math.round(total_revenue * 100) / 100,
                avg_order_value: Math.round(avg_order_value * 100) / 100,
            },
        };
    }
}