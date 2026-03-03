import { Knex } from "knex";
import { DatabaseProvider } from "db/DatabaseProvider.js";

//  BaseRepository 
// No @injectable()  cannot decorate abstract classes in tsyringe.
// Concrete subclasses carry @injectable().
//
// Why `create` is NOT here:
//   Each repo's create() has a different signature:
//     WalletRepository.create(userId, trx?)
//     WalletTransactionRepository.create(input, trx)   ← always needs trx
//     OrderRepository.create(data, trx)                ← always needs trx
//     OrderItemRepository.bulkCreate(items, trx)       ← different name
//   TypeScript's override rules require compatible signatures.
//   Since none of these match Partial<T>, create() lives on each repo directly.

export abstract class BaseRepository<T> {
    protected readonly db: Knex;
    protected abstract readonly table: string;

    constructor(dbProvider: DatabaseProvider) {
        this.db = dbProvider.getClient;
    }

    //  Soft-delete-aware query builder 
    // The single entry point for ALL read queries in subclasses.
    // Automatically applies whereNull('deleted_at') so no developer can forget it.
    //
    // Usage in subclasses:
    //   this.query()       -> non-transactional read, soft-delete filtered
    //   this.query(trx)    -> transactional read (e.g. FOR UPDATE), same filter
    //
    // For writes (INSERT / UPDATE) do NOT use query() - you intentionally
    // want to target a row regardless of deleted_at status (e.g. hard-delete).
    protected query(trx?: Knex.Transaction): Knex.QueryBuilder {
        return (trx ?? this.db)(this.table).whereNull(`${this.table}.deleted_at`);
    }

    async findById(id: number): Promise<T | null> {
        const row = await this.query().where({ id }).first();
        return row ?? null;
    }

    async findAll(): Promise<T[]> {
        return this.query().select("*");
    }

    async update(id: number, data: Partial<T>): Promise<T | null> {
        const [row] = await this.db(this.table)
            .where({ id })
            .update({ ...data, updated_at: this.db.fn.now() })
            .returning("*");
        return row ?? null;
    }

    async softDelete(id: number): Promise<void> {
        await this.db(this.table)
            .where({ id })
            .update({ deleted_at: this.db.fn.now() });
    }

    async hardDelete(id: number): Promise<void> {
        await this.db(this.table).where({ id }).delete();
    }

    //  Transaction-aware helpers 
    async insertWithTrx(data: Partial<T>, trx: Knex.Transaction): Promise<T> {
        const [row] = await trx(this.table).insert(data).returning("*");
        return row;
    }

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
