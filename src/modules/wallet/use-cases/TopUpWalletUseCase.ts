/**
 * @module TopUpWalletUseCase
 * @description Credits a user's wallet and writes an immutable ledger entry,
 * all inside a single audited transaction.
 *
 * Execution flow:
 *
 * ```
 * LOCK    wallet row FOR UPDATE          (prevents concurrent top-up races)
 * CREDIT  balance via DB-side arithmetic (balance + amount, never read-modify-write)
 * LEDGER  insert wallet_transactions row (immutable credit record)
 * COMMIT  audit trigger fires on wallet UPDATE and wallet_transactions INSERT
 * ```
 *
 * Why lock for a credit?
 *   Two concurrent top-ups for the same wallet both read the same
 *   `balance_before`, creating duplicate ledger entries with wrong snapshots.
 *   The FOR UPDATE lock serialises them so snapshots are always accurate.
 *
 * Why DB-side arithmetic?
 *   `balance + amount` in SQL is atomic.  Reading the balance in JS and
 *   adding to it (read-modify-write) creates a lost-update race between
 *   a concurrent debit and this credit.
 *
 * @see modules/wallet/services/WalletDeductionService.ts  (mirror for debits)
 * @see utils/audit/WithAuditContext.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { DatabaseProvider } from "db/DatabaseProvider.js";
import { LOGGER, Logger } from "utils/logger.js";
import { withAuditContext } from "utils/audit/WithAuditContext.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { AppError } from "shared/errors/AppError.js";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "../IWalletRepository.js";
import {
    type IWalletTransactionRepository,
    WALLET_TRANSACTION_REPOSITORY_TOKEN,
} from "modules/wallet-transaction/IWalletTransactionRepository.js";
import { TopUpWalletInput, TopUpWalletResult } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

/**
 * Credits a user's wallet with the given amount and records a ledger entry.
 *
 * @remarks
 * Wraps the entire flow in `withAuditContext()` so the wallet UPDATE and
 * wallet_transactions INSERT are both captured by the audit trigger with
 * the correct `performed_by`, `ip_address`, and `source` values.
 */
@injectable()
export class TopUpWalletUseCase {
    constructor(
        @inject(DatabaseProvider)
        private readonly dbProvider: DatabaseProvider,

        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(WALLET_TRANSACTION_REPOSITORY_TOKEN)
        private readonly walletTxRepo: IWalletTransactionRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(input: TopUpWalletInput): Promise<TopUpWalletResult> {
        const { userId, amount, description } = input;

        // Guard: amount must be positive - this is also enforced by the Zod
        // schema upstream, but we validate here as a defence-in-depth measure
        // since the use case can also be called directly (e.g. from tests).
        if (amount <= 0) {
            throw new AppError("VALIDATION_FAILED", {}, [
                {
                    field: "amount",
                    message: "Top-up amount must be greater than zero",
                },
            ]);
        }

        this.logger.info("[TopUpWallet] Starting", { userId, amount });

        return withAuditContext(this.dbProvider.getClient, async (trx) => {
            // LOCK - acquire FOR UPDATE before reading the balance.
            // Prevents two concurrent top-ups from recording wrong balance_before
            // snapshots in the ledger.
            const wallet = await this.walletRepo.findByUserIdForUpdate(
                userId,
                trx,
            );
            if (!wallet) {
                throw new NotFoundError(ErrorKeys.WALLET_NOT_FOUND, {
                    userId,
                });
            }

            const balanceBefore = parseFloat(wallet.balance);

            // CREDIT - DB-side arithmetic: balance + amount
            // The lock above guarantees no other transaction changes the balance
            // between our read (for the snapshot) and this write.
            const updatedWallet = await this.walletRepo.creditBalance(
                userId,
                amount,
                trx,
            );

            const balanceAfter = parseFloat(updatedWallet.balance);

            // LEDGER - immutable credit record in wallet_transactions.
            // Must be in the same transaction so it rolls back together if
            // anything downstream fails (defensive - nothing follows this).
            const transaction = await this.walletTxRepo.create(
                {
                    walletId: wallet.id,
                    orderId: null, // top-ups are not linked to any order
                    type: "credit",
                    amount,
                    balanceBefore,
                    balanceAfter,
                    description:
                        description ??
                        `Wallet top-up of ${updatedWallet.currency} ${amount.toFixed(2)}`,
                },
                trx,
            );

            this.logger.info("[TopUpWallet] Completed", {
                userId,
                walletId: wallet.id,
                amount,
                balanceBefore,
                balanceAfter,
            });

            return { wallet: updatedWallet, transaction };
        });
    }
}
