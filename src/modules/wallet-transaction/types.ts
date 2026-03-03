import { WalletTransactionType } from "modules/wallet/types.js";

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

export interface CreateWalletTransactionInput {
    walletId: number;
    orderId?: number | null;
    type: WalletTransactionType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description?: string;
}
