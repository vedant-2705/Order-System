import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { ReportRepository } from "../ReportRepository.js";
import { RevenueFilter, RevenueReport } from "../types.js";
import { meta } from "helpers/dateRange.js";

@injectable()
export class GetRevenueReportUseCase {
    constructor(
        @inject(ReportRepository)
        private readonly repo: ReportRepository,
        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(filters: RevenueFilter): Promise<RevenueReport> {
        const groupBy = filters.group_by ?? "day";
        this.logger.info("[Report:Revenue] Generating", {
            ...filters,
            groupBy,
        });

        const rows = await this.repo.getRevenue({
            ...filters,
            group_by: groupBy,
        });

        return {
            ...meta(filters),
            group_by: groupBy,
            rows,
        };
    }
}
