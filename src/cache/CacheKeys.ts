// Centralized key builder - single source of truth for all cache keys

export const CacheKeys = {
    // Products
    productList: (params: { search?: string }) =>
        `products:list:search:${params.search ?? "__none__"}`,

    productById: (id: string) => `products:single:${id}`,

    productListPattern: () => `products:list:*`,

    // Orders (user-scoped - each user sees only their orders)
    ordersByUser: (userId: string) => `orders:user:${userId}:list`,

    orderById: (id: string) => `orders:single:${id}`,

    ordersByUserPattern: (userId: string) => `orders:user:${userId}:*`,

    // Reports (admin-only, shared cache - no user-scoping needed)
    // Admin users see the same data; no PII separation needed at cache layer
    reportOrderSummary: (from: string | null, to: string | null) =>
        `report:order_summary:from:${from ?? "null"}:to:${to ?? "null"}`,

    reportRevenue: (from: string | null, to: string | null, groupBy: string) =>
        `report:revenue:from:${from ?? "null"}:to:${to ?? "null"}:group:${groupBy}`,

    reportTopCustomers: (
        from: string | null,
        to: string | null,
        limit: number,
    ) =>
        `report:top_customers:from:${from ?? "null"}:to:${to ?? "null"}:limit:${limit}`,

    reportTopProducts: (
        from: string | null,
        to: string | null,
        limit: number,
    ) =>
        `report:top_products:from:${from ?? "null"}:to:${to ?? "null"}:limit:${limit}`,

    reportPattern: () => `report:*`,

    // Live order stats (for SSE)
    orderStats: () => `stats:orders:live`,
};

export const CacheTTL = {
    PRODUCT_LIST: 60, // 1 min - changes on create/update/delete
    PRODUCT_SINGLE: 120, // 2 min - single product, stable until edited
    ORDER_LIST: 30, // 30s - orders change on create/cancel
    ORDER_SINGLE: 120, // 2 min - order detail, stable once created
    REPORT_SUMMARY: 300, // 5 min - expensive query, acceptable staleness
    REPORT_REVENUE: 300, // 5 min
    REPORT_TOP: 300, // 5 min
    ORDER_STATS: 10, // 10s - live stats for SSE
};
