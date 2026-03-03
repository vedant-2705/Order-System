/**
 * @module wallet/types
 * @description Domain types for the wallet module.
 *
 * `balance` is typed as `string` because PostgreSQL's `DECIMAL`/`NUMERIC`
 * columns are returned as strings by the `pg` driver to avoid JavaScript
 * floating-point precision loss.  Always use `parseFloat()` before arithmetic.
 */

/** Possible directions of a wallet transaction. */
export type WalletTransactionType =
    | "debit"       // money leaving the wallet (order payment)
    | "credit"      // money entering the wallet (top-up)
    | "refund"      // reversal of a debit
    | "adjustment"; // manual correction by admin

/** Database row shape for the `wallet` table. */
export interface Wallet {
    id: number;
    user_id: number;
    balance: string;
    currency: string;
    created_at: Date;
    updated_at: Date;
}