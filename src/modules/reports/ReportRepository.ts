/**
 * @module ReportRepository
 * @description Data-access layer for all report queries.
 *
 * Each report is a separate method with its own CTE query.
 * They are NOT combined into one mega-query because:
 *
 *   1. Independent performance - a slow top-products scan should not block
 *      a fast order-summary response. Each can be cached with its own TTL.
 *   2. Independent optimisation - adding an index for one report should not
 *      require retesting the other three.
 *   3. Report-specific params - group_by and limit only apply to specific
 *      reports and would make a shared query overly complex.
 *
 * CTE structure per query:
 *   Every query starts with a `filtered_base` CTE that applies the date
 *   filter once. Downstream CTEs build on it. This pattern means the date
 *   condition is always applied consistently regardless of how many joins
 *   follow.
 *
 * Why knex.raw() and not the query builder?
 *   Window functions (SUM OVER), RANK(), DATE_TRUNC, and multi-level CTE
 *   chaining are not expressible cleanly through Knex's builder API.
 *   Raw SQL is intentional here - it is more readable and maintainable
 *   for analytical queries than equivalent builder chains would be.
 *
 * Bind parameters ($1, $2 etc.) are always used for user input.
 * LIMIT values are validated and cast to integer in the use case before
 * reaching here - no string interpolation of user data anywhere.
 */
import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import {
    DateRangeFilter,
    RevenueFilter,
    TopCustomersFilter,
    TopProductsFilter,
    OrderSummaryRow,
    RevenueRow,
    TopCustomerRow,
    TopProductRow,
} from "./types.js";

@singleton()
export class ReportRepository {
    private readonly db;

    constructor(
        @inject(DATABASE_PROVIDER)
        dbProvider: DatabaseProvider,
    ) {
        this.db = dbProvider.getClient;
    }

    //  Report 1: Order Summary 

    /**
     * Returns order counts and revenue grouped by status.
     *
     * CTE chain:
     *   filtered_base  -> orders in date range, non-deleted
     *   summary        -> GROUP BY status with aggregates
     *
     * The ROLLUP alternative (GROUP BY ROLLUP(status)) would give totals
     * in one pass but is harder to type - we compute totals in the use case
     * from the returned rows instead.
     */
    async getOrderSummary(
        filters: DateRangeFilter,
    ): Promise<OrderSummaryRow[]> {
        console.log("From Report Repository", filters);
        const { from = null, to = null } = filters;
        const result = await this.db.raw<{ rows: OrderSummaryRow[] }>(
            `
            WITH filtered_base AS (
                SELECT
                    id,
                    status,
                    total_amount
                FROM orders
                WHERE deleted_at IS NULL
                  AND (CAST(:from AS text) IS NULL OR CAST(created_at AS date) >= CAST(:from AS date))
                  AND (CAST(:to AS text) IS NULL OR CAST(created_at AS date) <= CAST(:to AS date))
            ),

            summary AS (
                SELECT
                    status,
                    CAST(COUNT(*)        AS int)     AS order_count,
                    CAST(SUM(total_amount) AS numeric) AS total_revenue,
                    CAST(AVG(total_amount) AS numeric) AS avg_order_value,
                    CAST(MIN(total_amount) AS numeric) AS min_order_value,
                    CAST(MAX(total_amount) AS numeric) AS max_order_value
                FROM filtered_base
                GROUP BY status
            )

            SELECT *
            FROM summary
            ORDER BY
                -- Meaningful display order: active statuses first
                CASE status
                    WHEN 'pending'    THEN 1
                    WHEN 'confirmed'  THEN 2
                    WHEN 'processing' THEN 3
                    WHEN 'completed'  THEN 4
                    WHEN 'cancelled'  THEN 5
                    WHEN 'refunded'   THEN 6
                    ELSE 7
                END
            `,
            { from, to },
        );

        return result.rows;
    }

    //  Report 2: Revenue Over Time 

    /**
     * Returns revenue bucketed by day or month, with a running cumulative total.
     *
     * CTE chain:
     *   filtered_base  -> non-cancelled/refunded orders in date range
     *   bucketed       -> DATE_TRUNC groups timestamps into day/month buckets
     *   with_cumulative-> window function SUM OVER adds running total column
     *
     * Why a separate `bucketed` CTE instead of doing everything in one step?
     *   The window function (SUM OVER) needs to see the already-grouped rows.
     *   You cannot use a window function on the same SELECT that has GROUP BY
     *   applied - the window sees the aggregated rows, not the raw rows.
     *   The CTE makes this two-phase aggregation explicit and readable.
     *
     * group_by is interpolated as a string into DATE_TRUNC but is validated
     * by Zod to be strictly 'day' | 'month' before reaching this method -
     * no SQL injection risk.
     */
    async getRevenue(filters: RevenueFilter): Promise<RevenueRow[]> {
        const groupBy = filters.group_by ?? "day";

        // DATE_TRUNC format string for the period label:
        //   day   -> '2026-03-04'
        //   month -> '2026-03-01' (we format to '2026-03' in the SELECT)
        const periodExpr =
            groupBy === "month"
                ? `TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')`
                : `DATE_TRUNC('day', created_at)::date::text`;

        const { from = null, to = null } = filters;

        const result = await this.db.raw<{ rows: RevenueRow[] }>(
            `
            WITH filtered_base AS (
                SELECT
                    created_at,
                    total_amount
                FROM orders
                WHERE deleted_at IS NULL
                  AND status NOT IN ('cancelled', 'refunded')
                  AND (:from::date IS NULL OR created_at::date >= :from::date)
                  AND (:to::date IS NULL OR created_at::date <= :to::date)
            ),

            -- Phase 1: bucket by time period and aggregate
            bucketed AS (
                SELECT
                    ${periodExpr}                    AS period,
                    COUNT(*)::int                    AS order_count,
                    SUM(total_amount)::numeric       AS revenue
                FROM filtered_base
                GROUP BY ${periodExpr}
            ),

            -- Phase 2: add running cumulative total via window function
            -- SUM(revenue) OVER (ORDER BY period ASC ROWS UNBOUNDED PRECEDING)
            -- means: sum all revenue rows from the first row up to the current row.
            -- ROWS UNBOUNDED PRECEDING is explicit about the frame -
            -- default frame for ORDER BY is RANGE which can behave unexpectedly
            -- when multiple rows share the same period value.
            with_cumulative AS (
                SELECT
                    period,
                    order_count,
                    revenue,
                    SUM(revenue) OVER (
                        ORDER BY period ASC
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    )::numeric AS cumulative_revenue
                FROM bucketed
            )

            SELECT *
            FROM with_cumulative
            ORDER BY period ASC
            `,
            { from, to },
        );

        return result.rows;
    }

    //  Report 3: Top Customers 

    /**
     * Returns the top N customers by total spend.
     *
     * CTE chain:
     *   filtered_base    -> non-cancelled/refunded orders in date range + user join
     *   customer_totals  -> GROUP BY user, aggregate spend metrics
     *   ranked           -> RANK() window function assigns rank by total_spent
     *
     * Why RANK() instead of just ORDER BY + LIMIT?
     *   RANK() handles ties correctly - two customers with identical spend
     *   both get rank 1, and rank 2 is skipped. This is the correct behaviour
     *   for a leaderboard. ROW_NUMBER() would arbitrarily break ties.
     *
     *   We apply LIMIT after ranking so the limit cuts at rank N, not row N.
     *   If positions 9 and 10 both have identical spend, RANK() gives them
     *   both rank 9 and they both appear - the result may have 11 rows.
     *   That is correct behaviour.
     */
    async getTopCustomers(
        filters: TopCustomersFilter,
    ): Promise<TopCustomerRow[]> {
        const limit = Math.min(filters.limit ?? 10, 100);
        const { from = null, to = null } = filters;

        const result = await this.db.raw<{ rows: TopCustomerRow[] }>(
            `
            WITH filtered_base AS (
                SELECT
                    o.user_id,
                    o.total_amount,
                    o.created_at,
                    u.name  AS user_name,
                    u.email AS user_email
                FROM orders o
                JOIN users u ON u.id = o.user_id
                WHERE o.deleted_at IS NULL
                  AND o.status NOT IN ('cancelled', 'refunded')
                  AND (:from::date IS NULL OR o.created_at::date >= :from::date)
                  AND (:to::date IS NULL OR o.created_at::date <= :to::date)
            ),

            customer_totals AS (
                SELECT
                    user_id,
                    user_name,
                    user_email,
                    COUNT(*)::int                       AS order_count,
                    SUM(total_amount)::numeric          AS total_spent,
                    AVG(total_amount)::numeric          AS avg_order_value,
                    MAX(total_amount)::numeric          AS largest_order,
                    MIN(created_at)::text               AS first_order_at,
                    MAX(created_at)::text               AS last_order_at
                FROM filtered_base
                GROUP BY user_id, user_name, user_email
            ),

            -- RANK() assigns the same rank to ties.
            -- DENSE_RANK() would give no gaps after ties - also valid but
            -- RANK() is more conventional for leaderboards.
            ranked AS (
                SELECT
                    RANK() OVER (ORDER BY total_spent DESC)::int AS rank,
                    *
                FROM customer_totals
            )

            SELECT *
            FROM ranked
            WHERE rank <= :limit
            ORDER BY rank ASC, user_id ASC
            `,
            { from, to, limit}
        );

        return result.rows;
    }

    //  Report 4: Top Products 

    /**
     * Returns the top N products by units sold.
     *
     * CTE chain:
     *   filtered_orders  -> non-cancelled/refunded orders in date range
     *   line_items       -> JOIN order_items + products onto filtered_orders
     *   product_totals   -> GROUP BY product, aggregate sales metrics
     *   ranked           -> RANK() by units_sold descending
     *
     * Note on revenue calculation:
     *   total_revenue uses (quantity * price_at_purchase), the historical
     *   price snapshot - NOT products.price (the current price).
     *   This is critical: if a product was repriced mid-period, the revenue
     *   figure must reflect what customers actually paid.
     */
    async getTopProducts(filters: TopProductsFilter): Promise<TopProductRow[]> {
        const limit = Math.min(filters.limit ?? 10, 100);
        const { from = null, to = null } = filters;

        const result = await this.db.raw<{ rows: TopProductRow[] }>(
            `
            WITH filtered_orders AS (
                SELECT id AS order_id
                FROM orders
                WHERE deleted_at IS NULL
                  AND status NOT IN ('cancelled', 'refunded')
                  AND (:from::date IS NULL OR created_at::date >= :from::date)
                  AND (:to::date IS NULL OR created_at::date <= :to::date)
            ),

            -- Join order_items and products onto the filtered order set.
            -- Two separate CTEs (filtered_orders + line_items) rather than
            -- one big JOIN keeps the intent clear:
            --   filtered_orders = "which orders count"
            --   line_items      = "what was in those orders"
            line_items AS (
                SELECT
                    oi.order_id,
                    oi.product_id,
                    oi.quantity,
                    oi.price_at_purchase,
                    p.name AS product_name,
                    p.sku
                FROM order_items oi
                JOIN filtered_orders fo ON fo.order_id = oi.order_id
                JOIN products p ON p.id = oi.product_id
            ),

            product_totals AS (
                SELECT
                    product_id,
                    product_name,
                    sku,
                    SUM(quantity)::int                              AS units_sold,
                    SUM(quantity * price_at_purchase)::numeric      AS total_revenue,
                    AVG(price_at_purchase)::numeric                 AS avg_selling_price,
                    COUNT(DISTINCT order_id)::int                   AS appeared_in_orders
                FROM line_items
                GROUP BY product_id, product_name, sku
            ),

            ranked AS (
                SELECT
                    RANK() OVER (ORDER BY units_sold DESC)::int AS rank,
                    *
                FROM product_totals
            )

            SELECT *
            FROM ranked
            WHERE rank <= :limit
            ORDER BY rank ASC, product_id ASC
            `,
            { from, to, limit}
        );

        return result.rows;
    }
}
