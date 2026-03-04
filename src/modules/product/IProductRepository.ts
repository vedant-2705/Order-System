/**
 * @module IProductRepository
 * @description Repository interface for the `products` table.
 *
 * Injected by `PRODUCT_REPOSITORY_TOKEN`.
 *
 * Concurrency contract:
 *   - Before deducting stock, call `findByIdsForUpdate()` to acquire row locks.
 *   - `deductStock()` returns `false` (not throw) when stock is insufficient
 *     so the caller can decide whether to throw or retry.
 */
import { Knex } from "knex";
import { Product } from "./types.js";

/** DI injection token for {@link IProductRepository}. */
export const PRODUCT_REPOSITORY_TOKEN = Symbol("IProductRepository");

export interface IProductRepository {
    findById(id: string): Promise<Product | null>;
    findBySku(sku: string): Promise<Product | null>;
    findAllActive(): Promise<Product[]>;

    /**
     * Fetches products and acquires `FOR UPDATE` row locks.
     * `ORDER BY id ASC` enforces consistent lock ordering to prevent deadlocks.
     */
    findByIdsForUpdate(
        ids: string[],
        trx: Knex.Transaction,
    ): Promise<Product[]>;

    create(data: Partial<Product>, trx?: Knex.Transaction): Promise<Product>;
    update(
        id: string,
        data: Partial<Product>,
        trx?: Knex.Transaction,
    ): Promise<Product | null>;

    /**
     * Decrements `stock` by `qty` if `stock >= qty`.
     * Returns `true` on success, `false` if insufficient stock.
     */
    deductStock(
        id: string,
        qty: number,
        trx: Knex.Transaction,
    ): Promise<boolean>;

    softDelete(id: string): Promise<void>;
}