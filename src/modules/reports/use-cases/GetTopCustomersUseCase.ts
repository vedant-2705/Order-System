import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { ReportRepository } from "../ReportRepository.js";
import { TopCustomersFilter, TopCustomersReport } from "../types.js";
import { meta } from "helpers/dateRange.js";

@injectable()
export class GetTopCustomersUseCase {
    constructor(
        @inject(ReportRepository)
        private readonly repo: ReportRepository,
        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(filters: TopCustomersFilter): Promise<TopCustomersReport> {
        const limit = Math.min(filters.limit ?? 10, 100);
        this.logger.info("[Report:TopCustomers] Generating", {
            ...filters,
            limit,
        });

        const rows = await this.repo.getTopCustomers({ ...filters, limit });

        return {
            ...meta(filters),
            limit,
            rows,
        };
    }
}
