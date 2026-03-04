/**
 * @module reports/types
 * @description Domain types for the reports module.
 *
 * Each report is independent - its own filter shape, result shape, and
 * SQL query. They share a common base filter (from/to dates) but each
 * can extend it with report-specific params (group_by, limit, etc.).
 *
 * Why numeric fields typed as number and not string?
 *   The CTE queries use ::numeric casts in the SELECT so the pg driver
 *   returns them as JS numbers directly, not strings. This is intentional -
 *   reports are read-only, no further DB arithmetic is done on these values.
 */

//  Shared 

/** Base date-range filter shared by all report endpoints. */
export interface DateRangeFilter {
    from?: string; // ISO date 'YYYY-MM-DD', inclusive lower bound
    to?: string; // ISO date 'YYYY-MM-DD', inclusive upper bound
}

/** Metadata block attached to every report response. */
export interface ReportMeta {
    generated_at: string; // ISO timestamp of when the query ran
    filters: {
        from: string | null;
        to: string | null;
    };
}

//  Report 1: Order Summary 

/**
 * One row per order status showing counts and financial stats.
 */
export interface OrderSummaryRow {
    status: string;
    order_count: number;
    total_revenue: number;
    avg_order_value: number;
    min_order_value: number;
    max_order_value: number;
}

export interface OrderSummaryReport extends ReportMeta {
    breakdown: OrderSummaryRow[];
    totals: {
        total_orders: number;
        total_revenue: number;
        avg_order_value: number;
    };
}

//  Report 2: Revenue Over Time 

export type RevenueGroupBy = "day" | "month";

export interface RevenueFilter extends DateRangeFilter {
    group_by?: RevenueGroupBy; // default: 'day'
}

/**
 * One row per time bucket (day or month).
 * cumulative_revenue is computed by a window function in SQL -
 * pre-computed running total, ready to plot directly.
 */
export interface RevenueRow {
    period: string; // '2026-03-04' for day, '2026-03' for month
    order_count: number;
    revenue: number;
    cumulative_revenue: number; // SUM(revenue) OVER (ORDER BY period ASC)
}

export interface RevenueReport extends ReportMeta {
    group_by: RevenueGroupBy;
    rows: RevenueRow[];
}

//  Report 3: Top Customers 

export interface TopCustomersFilter extends DateRangeFilter {
    limit?: number; // default: 10, max: 100
}

export interface TopCustomerRow {
    rank: number;
    user_id: string;
    user_name: string;
    user_email: string;
    order_count: number;
    total_spent: number;
    avg_order_value: number;
    largest_order: number;
    first_order_at: string;
    last_order_at: string;
}

export interface TopCustomersReport extends ReportMeta {
    limit: number;
    rows: TopCustomerRow[];
}

//  Report 4: Top Products 

export interface TopProductsFilter extends DateRangeFilter {
    limit?: number; // default: 10, max: 100
}

/**
 * avg_selling_price uses price_at_purchase snapshots - tracks price drift
 * over the reporting period, not the current product price.
 */
export interface TopProductRow {
    rank: number;
    product_id: string;
    product_name: string;
    sku: string;
    units_sold: number;
    total_revenue: number;
    avg_selling_price: number;
    appeared_in_orders: number;
}

export interface TopProductsReport extends ReportMeta {
    limit: number;
    rows: TopProductRow[];
}
