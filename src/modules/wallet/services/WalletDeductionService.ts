import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Knex } from "knex";
import { AppError } from "shared/errors/AppError.js";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "../IWalletRepository.js";
import { Wallet } from "../types.js";
import { WalletTransaction } from "modules/wallet-transaction/types.js";
import { type IWalletTransactionRepository, WALLET_TRANSACTION_REPOSITORY_TOKEN } from "modules/wallet-transaction/IWalletTransactionRepository.js";

export interface DeductionResult {
    updatedWallet: Wallet;
    walletTransaction: WalletTransaction;
}

/**
 * Responsible for:
 *   1. Validating balance is sufficient
 *   2. Deducting balance (DB-side arithmetic)
 *   3. Writing immutable ledger entry to wallet_transactions
 *
 * Wallet row must already be locked FOR UPDATE before calling 
 * CreateOrderUseCase acquires the lock in the lock phase.
 */
@injectable()
export class WalletDeductionService {
    constructor(
        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(WALLET_TRANSACTION_REPOSITORY_TOKEN)
        private readonly walletTxRepo: IWalletTransactionRepository,
    ) {}

    async deduct(
        wallet: Wallet,
        amount: number,
        orderId: number | null,
        trx: Knex.Transaction,
    ): Promise<DeductionResult> {
        const balanceBefore = parseFloat(wallet.balance);

        // Validate  balance check happens here, not in the use case
        if (balanceBefore < amount) {
            throw new AppError("INSUFFICIENT_BALANCE", {
                required: String(amount),
                available: String(balanceBefore),
            });
        }

        const updatedWallet = await this.walletRepo.deductBalance(
            wallet.user_id,
            amount,
            trx,
        );
        const balanceAfter = parseFloat(updatedWallet.balance);

        const walletTransaction = await this.walletTxRepo.create(
            {
                walletId: wallet.id,
                orderId,
                type: "debit",
                amount,
                balanceBefore,
                balanceAfter,
                description: orderId
                    ? `Payment for order #${orderId}`
                    : `Wallet deduction`,
            },
            trx,
        );

        return { updatedWallet, walletTransaction };
    }
}
