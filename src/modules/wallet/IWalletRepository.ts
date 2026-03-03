import { Knex } from "knex";
import {
    Wallet,
} from "./types.js";

//  IWalletRepository 
export const WALLET_REPOSITORY_TOKEN = Symbol("IWalletRepository");

export interface IWalletRepository {
    findByUserId(userId: number): Promise<Wallet | null>;

    // FOR UPDATE  must be called before any balance check in createOrder.
    // Locks the row so no concurrent transaction can read/write it
    // until this transaction commits or rolls back.
    findByUserIdForUpdate(
        userId: number,
        trx: Knex.Transaction,
    ): Promise<Wallet | null>;

    create(userId: number, trx?: Knex.Transaction): Promise<Wallet>;
    deductBalance(
        userId: number,
        amount: number,
        trx: Knex.Transaction,
    ): Promise<Wallet>;
    creditBalance(
        userId: number,
        amount: number,
        trx: Knex.Transaction,
    ): Promise<Wallet>;
}