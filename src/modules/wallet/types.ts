/**
 * @module wallet/types
 * @description Domain types for the wallet module.
*
* `balance` is typed as `string` because PostgreSQL's `DECIMAL`/`NUMERIC`
* columns are returned as strings by the `pg` driver to avoid JavaScript
* floating-point precision loss.  Always use `parseFloat()` before arithmetic.
*/

import { WalletTransaction } from "modules/wallet-transaction/types.js";

/** Possible directions of a wallet transaction. */
export type WalletTransactionType =
| "debit"       // money leaving the wallet (order payment)
    | "credit"      // money entering the wallet (top-up)
    | "refund"      // reversal of a debit
    | "adjustment"; // manual correction by admin

/** Database row shape for the `wallet` table. */
export interface Wallet {
    id: string;
    user_id: string;
    balance: string;
    currency: string;
    created_at: Date;
    updated_at: Date;
}


/** Input accepted by `TopUpWalletUseCase.execute()`. */
export interface TopUpWalletInput {
    /** ID of the user whose wallet to credit. */
    userId: string;
    /** Amount to add. Must be a positive value greater than zero. */
    amount: number;
    /** Optional human-readable description for the ledger entry. */
    description?: string;
}

/** Value returned by a successful `TopUpWalletUseCase.execute()` call. */
export interface TopUpWalletResult {
    /** The wallet row after the credit has been applied. */
    wallet: Wallet;
    /** The immutable ledger entry recording this credit. */
    transaction: WalletTransaction;
}