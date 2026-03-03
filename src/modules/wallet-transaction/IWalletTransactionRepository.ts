/**
 * @module IWalletTransactionRepository
 * @description Repository interface for the `wallet_transactions` ledger table.
 *
 * Injected by `WALLET_TRANSACTION_REPOSITORY_TOKEN`.
 * `create()` always requires a transaction to ensure the ledger entry
 * stays atomic with the corresponding wallet balance update.
 */
import { Knex } from "knex";
import { CreateWalletTransactionInput, WalletTransaction } from "./types.js";

/** DI injection token for {@link IWalletTransactionRepository}. */
export const WALLET_TRANSACTION_REPOSITORY_TOKEN = Symbol(
    "IWalletTransactionRepository",
);

export interface IWalletTransactionRepository {
    /** Returns all ledger entries for a wallet ordered by newest first. */
    findByWalletId(walletId: number): Promise<WalletTransaction[]>;

    /** Finds the ledger entry created for a specific order. */
    findByOrderId(orderId: number): Promise<WalletTransaction | null>;

    /**
     * Inserts an immutable ledger entry.
     * Always requires `trx`  must be atomic with the wallet balance update.
     */
    create(
        input: CreateWalletTransactionInput,
        trx: Knex.Transaction,
    ): Promise<WalletTransaction>;
}
