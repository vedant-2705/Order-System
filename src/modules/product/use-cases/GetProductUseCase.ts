/**
 * @module GetProductUseCase
 * @description Read-only use case for fetching products.
 *
 * Sits between the controller and the repository, keeping the controller
 * free of any data-access or business logic. Even though the logic here
 * is simple today (fetch + 404 check), routing it through a use case means:
 *   - Future rules (e.g. hide products from inactive categories, price
 *     personalisation, feature flags) have a single place to live.
 *   - The controller stays a pure HTTP adapter with no business knowledge.
 *   - The repo stays a pure data-access layer with no domain knowledge.
 *
 * Methods:
 *   - `getAll`   -> all active (in-stock, non-deleted) products, optional name filter
 *   - `getById`  -> single product by PK, throws 404 if not found
 *   - `getBySku` -> single product by SKU, throws 404 if not found
 *
 * No transaction needed - pure reads with no concurrency concerns.
 *
 * @see modules/product/IProductRepository.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { Logger } from "utils/logger.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "../IProductRepository.js";
import { Product } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";
import { CacheService } from "cache/CacheService.js";
import { CacheKeys, CacheTTL } from "cache/CacheKeys.js";

/** Input accepted by `GetProductUseCase.getAll()`. */
export interface GetAllProductsInput {
    /** Optional case-insensitive substring filter on product name. */
    search?: string;
}

/**
 * Read-only use case for product retrieval.
 *
 * @remarks
 * All methods are non-transactional reads.
 * Soft-deleted products are invisible via `BaseRepository.query()`.
 */
@injectable()
export class GetProductUseCase {
    constructor(
        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(Logger)
        private readonly logger: Logger,

        @inject(CacheService)
        private readonly cache: CacheService,
    ) {}

    /**
     * Returns all active (non-deleted, in-stock) products.
     * Optionally filters by a case-insensitive name substring.
     *
     * @remarks
     * Filtering is applied in-memory for simplicity at current scale.
     * When the product catalogue grows, this should move into the repository
     * as an ILIKE query backed by `idx_products_name_active`.
     *
     * @param input - Optional search filter.
     */
    async getAll(input: GetAllProductsInput = {}): Promise<Product[]> {
        const cacheKey = CacheKeys.productList({ search: input.search });

        const cached = await this.cache.get<Product[]>(cacheKey);
        if (cached) {
            this.logger.debug("[GetProduct] Cache HIT", { cacheKey });
            return cached;
        }

        this.logger.debug("[GetProduct] Cache MISS - fetching from DB", {
            search: input.search,
        });

        // Cache miss
        let products = await this.productRepo.findAllActive();

        if (input.search?.trim()) {
            const term = input.search.trim().toLowerCase();
            products = products.filter((p) =>
                p.name.toLowerCase().includes(term),
            );
        }

        // Jitter: (+/-)10% to spread expiry across time
        const ttl = CacheTTL.PRODUCT_LIST + Math.floor(Math.random() * 12) - 6;
        await this.cache.set(cacheKey, products, ttl);

        return products;
    }

    /**
     * Returns a single active product by its internal primary key.
     *
     * @param id - Internal PK of the product.
     * @throws {NotFoundError} PRODUCT_NOT_FOUND if the product does not exist
     *         or has been soft-deleted.
     */
    async getById(id: string): Promise<Product> {
        const cacheKey = CacheKeys.productById(id);

        const cached = await this.cache.get<Product>(cacheKey);
        if (cached) return cached;

        const product = await this.productRepo.findById(id);
        if (!product) {
            throw new NotFoundError(ErrorKeys.PRODUCT_NOT_FOUND, {
                id: String(id),
            });
        }

        await this.cache.set(cacheKey, product, CacheTTL.PRODUCT_SINGLE);
        return product;
    }

    /**
     * Returns a single active product by its SKU.
     *
     * @param sku - The stock-keeping unit identifier.
     * @throws {NotFoundError} PRODUCT_NOT_FOUND if the product does not exist
     *         or has been soft-deleted.
     */
    async getBySku(sku: string): Promise<Product> {
        this.logger.debug("[GetProduct] By SKU", { sku });

        const product = await this.productRepo.findBySku(sku);
        if (!product) {
            throw new NotFoundError(ErrorKeys.PRODUCT_NOT_FOUND, { sku });
        }

        return product;
    }
}
