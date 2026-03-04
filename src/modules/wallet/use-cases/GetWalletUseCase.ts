/**
 * @module GetWalletUseCase
 * @description Read-only use case for fetching a user's wallet and
 * transaction history.
 *
 * Two query paths:
 *   - `getByUserId`      -> wallet row only (balance display)
 *   - `getWithHistory`   -> wallet + full ledger (wallet detail page)
 *
 * No transaction needed - pure reads with no concurrency concerns.
 * `findByUserId` (not `findByUserIdForUpdate`) is used deliberately:
 * we are reading for display only, not for mutation.
 *
 * @see modules/wallet/IWalletRepository.ts
 * @see modules/wallet-transaction/IWalletTransactionRepository.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { Logger } from "utils/logger.js";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "../IWalletRepository.js";
import {
    type IWalletTransactionRepository,
    WALLET_TRANSACTION_REPOSITORY_TOKEN,
} from "modules/wallet-transaction/IWalletTransactionRepository.js";
import { Wallet } from "../types.js";
import { WalletTransaction } from "modules/wallet-transaction/types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

/** Wallet row alongside its full transaction ledger. */
export interface WalletWithHistory {
    wallet: Wallet;
    transactions: WalletTransaction[];
}

/**
 * Read-only use case for wallet retrieval.
 *
 * @remarks
 * Uses `findByUserId` (no lock) - safe for display-only reads.
 * Never call `findByUserIdForUpdate` outside of a mutation transaction.
 */
@injectable()
export class GetWalletUseCase {
    constructor(
        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(WALLET_TRANSACTION_REPOSITORY_TOKEN)
        private readonly walletTxRepo: IWalletTransactionRepository,

        @inject(Logger)
        private readonly logger: Logger,
    ) {}

    /**
     * Returns a user's wallet row.
     *
     * @param userId - Primary key of the user.
     * @throws {NotFoundError} WALLET_NOT_FOUND if no wallet exists for the user.
     */
    async getByUserId(userId: number): Promise<Wallet> {
        this.logger.debug("[GetWallet] By user ID", { userId });

        const wallet = await this.walletRepo.findByUserId(userId);
        if (!wallet) {
            throw new NotFoundError(ErrorKeys.WALLET_NOT_FOUND, {
                userId: String(userId),
            });
        }

        return wallet;
    }

    /**
     * Returns a user's wallet alongside their full transaction history.
     *
     * @remarks
     * Transaction history is ordered newest-first by the repository.
     * Used for the wallet detail / statement page.
     *
     * @param userId - Primary key of the user.
     * @throws {NotFoundError} WALLET_NOT_FOUND if no wallet exists for the user.
     */
    async getWithHistory(userId: number): Promise<WalletWithHistory> {
        this.logger.debug("[GetWallet] With history for user", { userId });

        const wallet = await this.walletRepo.findByUserId(userId);
        if (!wallet) {
            throw new NotFoundError(ErrorKeys.WALLET_NOT_FOUND, {
                userId: String(userId),
            });
        }

        const transactions = await this.walletTxRepo.findByWalletId(wallet.id);

        return { wallet, transactions };
    }
}
