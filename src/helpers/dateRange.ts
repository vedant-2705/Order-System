import { DateRangeFilter, ReportMeta } from "modules/reports/types.js";

export function meta(filters: DateRangeFilter): ReportMeta {
    return {
        generated_at: new Date().toISOString(),
        filters: {
            from: filters.from ?? null,
            to: filters.to ?? null,
        },
    };
}