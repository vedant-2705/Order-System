import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { ReportRepository } from "../ReportRepository.js";
import { TopProductsFilter, TopProductsReport } from "../types.js";
import { meta } from "helpers/dateRange.js";

@injectable()
export class GetTopProductsUseCase {
    constructor(
        @inject(ReportRepository)
        private readonly repo: ReportRepository,
        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(filters: TopProductsFilter): Promise<TopProductsReport> {
        const limit = Math.min(filters.limit ?? 10, 100);
        this.logger.info("[Report:TopProducts] Generating", {
            ...filters,
            limit,
        });

        const rows = await this.repo.getTopProducts({ ...filters, limit });

        return {
            ...meta(filters),
            limit,
            rows,
        };
    }
}
