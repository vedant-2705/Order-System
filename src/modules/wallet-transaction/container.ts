import "reflect-metadata";
import { container } from "tsyringe";
import { WalletTransactionRepository } from "./WalletTransactionRepository.js";
import { WALLET_TRANSACTION_REPOSITORY_TOKEN } from "./IWalletTransactionRepository.js";

export function registerWalletTransactionModule(): void {
    container.registerSingleton<WalletTransactionRepository>(
        WALLET_TRANSACTION_REPOSITORY_TOKEN,
        WalletTransactionRepository,
    );
}