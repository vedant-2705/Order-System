export type WalletTransactionType =
    | "debit"
    | "credit"
    | "refund"
    | "adjustment";

export interface Wallet {
    id: number;
    user_id: number;
    balance: string;
    currency: string;
    created_at: Date;
    updated_at: Date;
}