import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { CacheService } from "cache/CacheService.js";
import { CacheKeys, CacheTTL } from "cache/CacheKeys.js";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";

export interface LiveOrderStats {
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    revenueToday: number;
    activeUsers: number; // users who placed orders today
    timestamp: string; // ISO-8601 - tells the client when the snapshot was taken
}

/**
 * Aggregates live order statistics for the SSE broadcast stream.
 *
 * ## Caching strategy
 *
 * The broadcast loop in app.ts calls getLiveStats() every 5 seconds.
 * Without caching, that's 12 DB aggregation queries per minute, per
 * connected admin - a significant load for what is essentially a dashboard.
 *
 * We cache the result for 10 seconds (CacheTTL.ORDER_STATS):
 *   - At most 6 DB queries per minute regardless of how many admins are watching
 *   - Acceptable staleness for a live dashboard (10s lag is imperceptible)
 *   - Cache is explicitly invalidated by CreateOrderUseCase and CancelOrderUseCase
 *     after each commit, so the next broadcast picks up fresh data promptly
 *
 * ## Query design
 *
 * Two queries run in parallel via Promise.all:
 *
 *   1. statusCounts - COUNT(*) GROUP BY status
 *      Returns one row per status with its count.
 *      Drives: totalOrders, pendingOrders, completedOrders, cancelledOrders.
 *
 *   2. todayRevenue - SUM(total_amount) for non-cancelled orders today
 *      Filtered to today's orders (created_at >= midnight) to give
 *      a "revenue today" metric relevant to daily operations.
 *      Excludes 'cancelled' and 'refunded' to show only realised revenue.
 *
 * Both queries filter deleted_at IS NULL so soft-deleted orders don't
 * appear in the dashboard numbers.
 */
@singleton()
export class OrderStatsService {
    private readonly db;

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider,

        @inject(CacheService)
        private readonly cache: CacheService,
    ) {
        this.db = dbProvider.getClient;
    }

    async getLiveStats(): Promise<LiveOrderStats> {
        const cacheKey = CacheKeys.orderStats();

        const cached = await this.cache.get<LiveOrderStats>(cacheKey);
        if (cached) return cached;

        // Cache miss - run DB aggregation
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [statusCounts, todayRevenue, activeUsersResult] =
            await Promise.all([
                // Query 1: order counts per status (all-time, non-deleted)
                this.db("orders")
                    .whereNull("deleted_at")
                    .select("status")
                    .count("* as count")
                    .groupBy("status"),

                // Query 2: revenue for non-cancelled/refunded orders created today
                this.db("orders")
                    .whereNull("deleted_at")
                    .where("created_at", ">=", today)
                    .whereNotIn("status", ["cancelled", "refunded"])
                    .sum("total_amount as revenue")
                    .first(),

                // Query 3: distinct users who placed any order today (all statuses)
                // Gives a sense of daily active purchasers for the dashboard
                this.db("orders")
                    .whereNull("deleted_at")
                    .where("created_at", ">=", today)
                    .countDistinct("user_id as count")
                    .first(),
            ]);

        // Build status map: { pending: 12, completed: 45, cancelled: 3, ... }
        const statusMap = new Map(
            statusCounts.map((r) => [r.status as string, Number(r.count)]),
        );

        const stats: LiveOrderStats = {
            totalOrders: Array.from(statusMap.values()).reduce(
                (a, b) => a + b,
                0,
            ),
            pendingOrders: statusMap.get("pending") ?? 0,
            completedOrders: statusMap.get("completed") ?? 0,
            cancelledOrders: statusMap.get("cancelled") ?? 0,
            revenueToday: Number(todayRevenue?.revenue ?? 0),
            activeUsers: Number(activeUsersResult?.count ?? 0),
            timestamp: new Date().toISOString(),
        };

        await this.cache.set(cacheKey, stats, CacheTTL.ORDER_STATS);
        return stats;
    }
}
