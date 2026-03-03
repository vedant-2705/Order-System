/**
 * @module wallet/container
 * @description Registers wallet module dependencies into the tsyringe container.
 *
 * Binds `WALLET_REPOSITORY_TOKEN` to `WalletRepository`.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { WalletRepository } from "./WalletRepository.js";
import { WALLET_REPOSITORY_TOKEN } from "./IWalletRepository.js";

/** Registers `WalletRepository` as the singleton implementation of `IWalletRepository`. */
export function registerWalletModule(): void {
    container.registerSingleton<WalletRepository>(
        WALLET_REPOSITORY_TOKEN,
        WalletRepository,
    );
}