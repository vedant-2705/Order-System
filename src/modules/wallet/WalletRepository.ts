import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import {
    IWalletRepository,
} from "./IWalletRepository.js";
import {
    Wallet,
} from "./types.js";

@singleton()
export class WalletRepository
    extends BaseRepository<Wallet>
    implements IWalletRepository
{
    protected readonly table = "wallet";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider
    ) {
        super(dbProvider);
    }

    async findByUserId(userId: number): Promise<Wallet | null> {
        const row = await this.db(this.table)
            .where({ user_id: userId })
            .first();
        return row ?? null;
    }

    // FOR UPDATE  primary defence against lost-update on balance.
    // Must be called BEFORE balance validation in createOrder.
    async findByUserIdForUpdate(
        userId: number,
        trx: Knex.Transaction,
    ): Promise<Wallet | null> {
        const row = await trx(this.table)
            .where({ user_id: userId })
            .forUpdate()
            .first();
        return row ?? null;
    }

    async create(userId: number, trx?: Knex.Transaction): Promise<Wallet> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb
            .insert({ user_id: userId, balance: 0.0, currency: "INR" })
            .returning("*");
        return row;
    }

    // DB-side arithmetic  never read-modify-write in application code.
    async deductBalance(
        userId: number,
        amount: number,
        trx: Knex.Transaction,
    ): Promise<Wallet> {
        const [row] = await trx(this.table)
            .where({ user_id: userId })
            .update({
                balance: this.db.raw("balance - ?", [amount]),
                updated_at: this.db.fn.now(),
            })
            .returning("*");
        return row;
    }

    async creditBalance(
        userId: number,
        amount: number,
        trx: Knex.Transaction,
    ): Promise<Wallet> {
        const [row] = await trx(this.table)
            .where({ user_id: userId })
            .update({
                balance: this.db.raw("balance + ?", [amount]),
                updated_at: this.db.fn.now(),
            })
            .returning("*");
        return row;
    }
}