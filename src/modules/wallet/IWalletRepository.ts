/**
 * @module IWalletRepository
 * @description Repository interface for the `wallet` table.
 *
 * Injected by `WALLET_REPOSITORY_TOKEN` so the DI container can swap
 * implementations for testing.
 *
 * Locking contract:
 *   Any balance mutation **must** be preceded by `findByUserIdForUpdate()`
 *   within the same transaction to prevent lost-update concurrency bugs.
 */
import { Knex } from "knex";
import { Wallet } from "./types.js";

/** DI injection token for {@link IWalletRepository}. */
export const WALLET_REPOSITORY_TOKEN = Symbol("IWalletRepository");

export interface IWalletRepository {
    /** Finds a wallet without locking. Safe for read-only display only. */
    findByUserId(userId: number): Promise<Wallet | null>;

    /**
     * Finds a wallet and acquires a `FOR UPDATE` row lock.
     * Must be called before any balance deduction within a transaction.
     */
    findByUserIdForUpdate(
        userId: number,
        trx: Knex.Transaction,
    ): Promise<Wallet | null>;

    /** Creates a zero-balance wallet for a user. */
    create(userId: number, trx?: Knex.Transaction): Promise<Wallet>;

    /** Decrements balance using DB-side arithmetic (`balance - amount`). */
    deductBalance(
        userId: number,
        amount: number,
        trx: Knex.Transaction,
    ): Promise<Wallet>;

    /** Increments balance using DB-side arithmetic (`balance + amount`). */
    creditBalance(
        userId: number,
        amount: number,
        trx: Knex.Transaction,
    ): Promise<Wallet>;
}