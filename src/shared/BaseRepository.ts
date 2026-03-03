/**
 * @module BaseRepository
 * @description Abstract generic repository providing shared CRUD operations.
 *
 * All concrete repositories extend this class and gain:
 *   - A Knex instance sourced from the injected `DatabaseProvider`
 *   - A soft-delete-safe query builder (`query()`) that filters deleted_at automatically
 *   - Standard read methods: `findById`, `findAll`
 *   - Standard write helpers: `update`, `softDelete`, `hardDelete`
 *   - Transaction-aware helpers: `insertWithTrx`, `updateWithTrx`
 *
 * Why `create` is NOT here:
 *   Each repository's `create()` has a unique signature and some require
 *   a transaction to be mandatory.  A shared base signature would either
 *   be too loose (`Partial<T>`) or force incorrect overrides.
 *
 * @template T - The domain entity type this repository manages.
 */
import { Knex } from "knex";
import { DatabaseProvider } from "db/DatabaseProvider.js";

//  BaseRepository 
// No @injectable()  cannot decorate abstract classes in tsyringe.
// Concrete subclasses carry @injectable().
//
// Why `create` is NOT here:
//   Each repo's create() has a different signature:
//     WalletRepository.create(userId, trx?)
//     WalletTransactionRepository.create(input, trx)   <- always needs trx
//     OrderRepository.create(data, trx)                <- always needs trx
//     OrderItemRepository.bulkCreate(items, trx)       <- different name
//   TypeScript's override rules require compatible signatures.
//   Since none of these match Partial<T>, create() lives on each repo directly.

/**
 * Abstract base class for all data-access repositories.
 *
 * @remarks
 * Cannot carry `@injectable()` because tsyringe does not support
 * decorating abstract classes.  Each concrete subclass must carry
 * its own `@injectable()` or `@singleton()` decorator.
 *
 * @template T - The domain entity type returned by query methods.
 */
export abstract class BaseRepository<T> {
    protected readonly db: Knex;
    protected abstract readonly table: string;

    constructor(dbProvider: DatabaseProvider) {
        this.db = dbProvider.getClient;
    }

    /**
     * Soft-delete-aware query builder  the single entry point for all reads.
     *
     * @remarks
     * Automatically applies `WHERE table.deleted_at IS NULL` so developers
     * can never accidentally query soft-deleted rows by forgetting the filter.
     *
     * Use `this.query()` for non-transactional reads.
     * Use `this.query(trx)` inside a transaction (e.g. with `FOR UPDATE`).
     *
     * For writes (INSERT / UPDATE / hard DELETE) use `this.db(this.table)`
     * directly  writes intentionally ignore `deleted_at`.
     *
     * @param trx - Optional transaction client.  When provided the query
     *              participates in the caller's transaction.
     * @returns A Knex QueryBuilder scoped to the concrete repository's table,
     *          pre-filtered to exclude soft-deleted rows.
     */
    protected query(trx?: Knex.Transaction): Knex.QueryBuilder {
        return (trx ?? this.db)(this.table).whereNull(`${this.table}.deleted_at`);
    }

    /**
     * Finds a single active (non-deleted) row by primary key.
     *
     * @param id - The primary key value to look up.
     * @returns The matching entity, or `null` if not found or soft-deleted.
     */
    async findById(id: number): Promise<T | null> {
        const row = await this.query().where({ id }).first();
        return row ?? null;
    }

    /**
     * Returns all active (non-deleted) rows in the table.
     *
     * @returns Array of entities; empty array if the table is empty.
     */
    async findAll(): Promise<T[]> {
        return this.query().select("*");
    }

    /**
     * Updates a row and returns the updated entity.
     *
     * @param id   - Primary key of the row to update.
     * @param data - Partial entity with the fields to change.
     * @returns The updated entity, or `null` if the row does not exist.
     */
    async update(id: number, data: Partial<T>): Promise<T | null> {
        const [row] = await this.db(this.table)
            .where({ id })
            .update({ ...data, updated_at: this.db.fn.now() })
            .returning("*");
        return row ?? null;
    }

    /**
     * Soft-deletes a row by stamping `deleted_at` with the current timestamp.
     *
     * @remarks
     * The row remains in the database and will be excluded from `query()`
     * results automatically.  Use `hardDelete` to permanently remove data.
     *
     * @param id - Primary key of the row to soft-delete.
     */
    async softDelete(id: number): Promise<void> {
        await this.db(this.table)
            .where({ id })
            .update({ deleted_at: this.db.fn.now() });
    }

    /**
     * Permanently removes a row from the database.
     *
     * @remarks
     * Prefer `softDelete` for user-generated data so deleted records can be
     * recovered and so audit triggers can capture the DELETE event.
     * Reserve `hardDelete` for test teardown or GDPR erasure.
     *
     * @param id - Primary key of the row to permanently delete.
     */
    async hardDelete(id: number): Promise<void> {
        await this.db(this.table).where({ id }).delete();
    }

    /**
     * Inserts a row within an existing transaction.
     *
     * @param data - Partial entity to insert.
     * @param trx  - The active transaction client.
     * @returns The newly inserted entity (via `RETURNING *`).
     */
    async insertWithTrx(data: Partial<T>, trx: Knex.Transaction): Promise<T> {
        const [row] = await trx(this.table).insert(data).returning("*");
        return row;
    }

    /**
     * Updates a row within an existing transaction.
     *
     * @param id   - Primary key of the row to update.
     * @param data - Partial entity with the fields to change.
     * @param trx  - The active transaction client.
     * @returns The updated entity, or `null` if the row does not exist.
     */
    async updateWithTrx(
        id: number,
        data: Partial<T>,
        trx: Knex.Transaction,
    ): Promise<T | null> {
        const [row] = await trx(this.table)
            .where({ id })
            .update({ ...data, updated_at: trx.fn.now() })
            .returning("*");
        return row ?? null;
    }
}
