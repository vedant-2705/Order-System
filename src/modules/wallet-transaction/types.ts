/**
 * @module wallet-transaction/types
 * @description Domain types for the wallet-transaction (ledger) module.
 *
 * `amount`, `balance_before`, and `balance_after` are typed as `string`
 * because PostgreSQL `DECIMAL` columns are returned as strings by the `pg`
 * driver to preserve precision.
 */
import { WalletTransactionType } from "modules/wallet/types.js";

/** Database row shape for the `wallet_transactions` table. */
export interface WalletTransaction {
    id: number;
    wallet_id: number;
    order_id: number | null;
    transaction_type: WalletTransactionType;
    amount: string;
    balance_before: string;
    balance_after: string;
    description: string | null;
    created_at: Date;
}

/** Input shape accepted by `WalletTransactionRepository.create()`. */
export interface CreateWalletTransactionInput {
    walletId: number;
    orderId?: number | null;
    type: WalletTransactionType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description?: string;
}
