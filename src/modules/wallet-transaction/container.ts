/**
 * @module wallet-transaction/container
 * @description Registers wallet-transaction module dependencies into the tsyringe container.
 *
 * Binds `WALLET_TRANSACTION_REPOSITORY_TOKEN` to `WalletTransactionRepository`.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { WalletTransactionRepository } from "./WalletTransactionRepository.js";
import { WALLET_TRANSACTION_REPOSITORY_TOKEN } from "./IWalletTransactionRepository.js";

/** Registers `WalletTransactionRepository` as the singleton implementation. */
export function registerWalletTransactionModule(): void {
    container.registerSingleton<WalletTransactionRepository>(
        WALLET_TRANSACTION_REPOSITORY_TOKEN,
        WalletTransactionRepository,
    );
}