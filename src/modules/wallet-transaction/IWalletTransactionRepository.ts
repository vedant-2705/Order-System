import { Knex } from "knex";
import { CreateWalletTransactionInput, WalletTransaction } from "./types.js";

//  IWalletTransactionRepository
export const WALLET_TRANSACTION_REPOSITORY_TOKEN = Symbol(
    "IWalletTransactionRepository",
);

export interface IWalletTransactionRepository {
    findByWalletId(walletId: number): Promise<WalletTransaction[]>;
    findByOrderId(orderId: number): Promise<WalletTransaction | null>;

    // Always requires trx  must be atomic with wallet.balance update.
    create(
        input: CreateWalletTransactionInput,
        trx: Knex.Transaction,
    ): Promise<WalletTransaction>;
}
