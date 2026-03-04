/**
 * @module ProductRepository
 * @description Data-access layer for the `products` table.
 *
 * Key design decisions:
 *   - `findByIdsForUpdate` uses `ORDER BY id ASC` before acquiring locks to
 *     guarantee a consistent lock-acquisition order across all transactions.
 *     This prevents deadlocks when two requests order the same products in
 *     different sequences.
 *   - `deductStock` uses a conditional update (`WHERE stock >= qty`) as a
 *     server-side guard.  If zero rows are affected, the caller knows stock
 *     was insufficient and can roll back immediately.
 *
 * @see shared/BaseRepository.ts  for inherited query helpers
 * @see modules/product/IProductRepository.ts
 */
import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IProductRepository } from "./IProductRepository.js";
import { Product } from "./types.js";

/**
 * Concrete repository for the `products` table.
 *
 * @remarks
 * Decorated with `@singleton()` so the DI container creates exactly one
 * instance and all injections share the same Knex connection pool reference.
 */
@singleton()
export class ProductRepository
    extends BaseRepository<Product>
    implements IProductRepository
{
    protected readonly table = "products";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider
    ) {
        super(dbProvider);
    }

    /**
     * Finds an active product by its unique SKU.
     *
     * @param sku - The stock-keeping unit identifier.
     * @returns The product, or `null` if not found or soft-deleted.
     */
    async findBySku(sku: string): Promise<Product | null> {
        const row = await this.query()
            .where({ sku })
            .first();
        return row ?? null;
    }

    /**
     * Returns all non-deleted products that have at least 1 unit in stock.
     *
     * @returns Array of in-stock products; empty array if none.
     */
    async findAllActive(): Promise<Product[]> {
        return this.query().where("stock", ">", 0);
    }

    /**
     * Fetches multiple products and acquires `SELECT ... FOR UPDATE` locks.
     *
     * @remarks
     * `ORDER BY id ASC` enforces a consistent lock ordering so that two
     * concurrent transactions that request overlapping product sets always
     * acquire locks in the same order  preventing deadlocks.
     *
     * @param ids - Array of product IDs to lock and retrieve.
     * @param trx - The active transaction that will hold the locks.
     * @returns Array of locked product rows (only non-deleted ones).
     */
    async findByIdsForUpdate(
        ids: string[],
        trx: Knex.Transaction,
    ): Promise<Product[]> {
        return this.query(trx)
            .whereIn("id", ids)
            .orderBy("id", "asc") // consistent lock order -> prevents deadlocks
            .forUpdate();
    }

    /**
     * Inserts a new product row.
     *
     * @param data - Partial product fields to insert.
     * @param trx  - Optional transaction client.
     * @returns The newly created product row.
     */
    async create(
        data: Partial<Product>,
        trx?: Knex.Transaction,
    ): Promise<Product> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb.insert(data).returning("*");
        return row;
    }

    /**
     * Updates product fields.
     *
     * @param id   - Primary key of the product to update.
     * @param data - Partial product fields to change.
     * @param trx  - Optional transaction client.
     * @returns The updated product, or `null` if not found.
     */
    async update(
        id: string,
        data: Partial<Product>,
        trx?: Knex.Transaction,
    ): Promise<Product | null> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb
            .where({ id })
            .update({ ...data, updated_at: this.db.fn.now() })
            .returning("*");
        return row ?? null;
    }

    /**
     * Atomically deducts stock using a conditional DB update.
     *
     * @remarks
     * The `WHERE stock >= qty` condition acts as an optimistic guard:
     * if another transaction has already decremented stock below `qty`,
     * this update affects 0 rows and returns `false`  the caller should
     * throw `INSUFFICIENT_STOCK` and roll back.
     *
     * DB-side arithmetic (`stock - qty`) is used to avoid read-modify-write.
     *
     * @param id  - Primary key of the product.
     * @param qty - The quantity to subtract from `stock`.
     * @param trx - The active transaction (required).
     * @returns `true` if the deduction succeeded; `false` if insufficient stock.
     */
    async deductStock(
        id: string,
        qty: number,
        trx: Knex.Transaction,
    ): Promise<boolean> {
        const rowsAffected = await trx(this.table)
            .where({ id })
            .where("stock", ">=", qty)
            .update({
                stock: this.db.raw("stock - ?", [qty]),
                updated_at: this.db.fn.now(),
            });

        return rowsAffected === 1;
    }
}
