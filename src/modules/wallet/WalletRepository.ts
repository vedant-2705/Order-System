/**
 * @module WalletRepository
 * @description Data-access layer for the `wallet` table.
 *
 * Critical concurrency note:
 *   Any code path that reads the balance for the purpose of deducting it
 *   **must** call `findByUserIdForUpdate()` first (not `findByUserId()`).
 *   This acquires a `SELECT ... FOR UPDATE` lock, preventing another concurrent
 *   transaction from reading a stale balance and creating a lost-update.
 *
 *   `deductBalance` and `creditBalance` use DB-side arithmetic
 *   (`balance - ?`, `balance + ?`) so the math never leaves the database,
 *   eliminating the read-modify-write anti-pattern entirely.
 *
 * @see modules/wallet/IWalletRepository.ts
 */
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

/**
 * Concrete repository for the `wallet` table.
 *
 * @remarks
 * One wallet per user  there is no `findAll()` use case in this domain,
 * so only user-scoped lookups are implemented.
 */
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

    /**
     * Finds the wallet for a user without acquiring a row lock.
     *
     * @remarks
     * Safe for read-only display (balance shown on a dashboard).
     * **Not** safe before a balance deduction  use `findByUserIdForUpdate` instead.
     *
     * @param userId - The user whose wallet to retrieve.
     * @returns The wallet, or `null` if no wallet has been created yet.
     */
    async findByUserId(userId: string): Promise<Wallet | null> {
        const row = await this.db(this.table)
            .where({ user_id: userId })
            .first();
        return row ?? null;
    }

    /**
     * Finds the wallet and acquires a `SELECT ... FOR UPDATE` row lock.
     *
     * @remarks
     * **Must** be called before any balance check in the order creation flow.
     * Holds the lock until the enclosing transaction commits or rolls back,
     * blocking any concurrent transaction that tries to lock the same row.
     *
     * @param userId - The user whose wallet to lock and retrieve.
     * @param trx    - The active transaction that will hold the lock.
     * @returns The locked wallet row, or `null` if not found.
     */
    async findByUserIdForUpdate(
        userId: string,
        trx: Knex.Transaction,
    ): Promise<Wallet | null> {
        const row = await trx(this.table)
            .where({ user_id: userId })
            .forUpdate()
            .first();
        return row ?? null;
    }

    /**
     * Creates a new wallet for a user with zero balance.
     *
     * @param userId - User to create the wallet for.
     * @param trx    - Optional transaction client.
     * @returns The newly created wallet row.
     */
    async create(userId: string, trx?: Knex.Transaction): Promise<Wallet> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb
            .insert({ user_id: userId, balance: 0.0, currency: "INR" })
            .returning("*");
        return row;
    }

    /**
     * Deducts an amount from a wallet using DB-side arithmetic.
     *
     * @remarks
     * Uses `balance - ?` in the SQL so the arithmetic is atomic and there
     * is no read-modify-write round-trip.  The wallet row must already be
     * locked `FOR UPDATE` by the caller before this method is invoked.
     *
     * @param userId - Identifies the wallet row to update.
     * @param amount - The positive amount to subtract from `balance`.
     * @param trx    - The active transaction (required).
     * @returns The updated wallet row with the new balance.
     */
    async deductBalance(
        userId: string,
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

    /**
     * Credits an amount to a wallet using DB-side arithmetic.
     *
     * @remarks
     * Uses `balance + ?` in the SQL  same safety guarantee as `deductBalance`.
     *
     * @param userId - Identifies the wallet row to update.
     * @param amount - The positive amount to add to `balance`.
     * @param trx    - The active transaction (required).
     * @returns The updated wallet row with the new balance.
     */
    async creditBalance(
        userId: string,
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