import "reflect-metadata";
import { inject, injectable } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IProductRepository } from "./IProductRepository.js";
import { Product } from "./types.js";

@injectable()
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

    async findBySku(sku: string): Promise<Product | null> {
        const row = await this.db(this.table)
            .where({ sku })
            .whereNull("deleted_at")
            .first();
        return row ?? null;
    }

    async findAllActive(): Promise<Product[]> {
        return this.db(this.table)
            .whereNull("deleted_at")
            .where("stock", ">", 0);
    }

    async findByIdsForUpdate(
        ids: number[],
        trx: Knex.Transaction,
    ): Promise<Product[]> {
        return trx(this.table)
            .whereIn("id", ids)
            .whereNull("deleted_at")
            .orderBy("id", "asc") // consistent lock order -> prevents deadlocks
            .forUpdate();
    }

    async create(
        data: Partial<Product>,
        trx?: Knex.Transaction,
    ): Promise<Product> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb.insert(data).returning("*");
        return row;
    }

    async update(
        id: number,
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

    // WHERE stock >= qty prevents deducting below zero gracefully.
    // rowsAffected === 0 means stock was insufficient -> caller rolls back.
    async deductStock(
        id: number,
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
