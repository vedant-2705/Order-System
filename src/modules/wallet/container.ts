import "reflect-metadata";
import { container } from "tsyringe";
import { WalletRepository } from "./WalletRepository.js";
import { WALLET_REPOSITORY_TOKEN } from "./IWalletRepository.js";

export function registerWalletModule(): void {
    container.registerSingleton<WalletRepository>(
        WALLET_REPOSITORY_TOKEN,
        WalletRepository,
    );
}