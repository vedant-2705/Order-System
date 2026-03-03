/**
 * @module WalletTransactionRepository
 * @description Data-access layer for the `wallet_transactions` (ledger) table.
 *
 * `wallet_transactions` is an immutable append-only ledger.
 * Every balance change is recorded here so the full debit/credit history
 * of a wallet is auditable without relying solely on the audit trigger.
 *
 * All writes go through `create()` which always requires a transaction
 * client, ensuring the ledger entry is atomic with the balance update on
 * the `wallet` table.
 *
 * @see modules/wallet/WalletRepository.ts  for the companion balance update
 */
import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { CreateWalletTransactionInput, WalletTransaction } from "./types.js";
import { IWalletTransactionRepository } from "./IWalletTransactionRepository.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { Knex } from "knex";

/**
 * Concrete repository for the `wallet_transactions` table.
 *
 * @remarks
 * Read methods (`findByWalletId`, `findByOrderId`) are intentionally
 * non-transactional  they are used for display / reporting only.
 * Writes always require a transaction to stay atomic with wallet balance updates.
 */
@singleton()
export class WalletTransactionRepository
    extends BaseRepository<WalletTransaction>
    implements IWalletTransactionRepository
{
    protected readonly table = "wallet_transactions";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider
    ) {
        super(dbProvider);
    }

    /**
     * Returns all ledger entries for a wallet, newest first.
     *
     * @remarks
     * Uses index `idx_wallet_transactions_wallet_created`
     * (wallet_id, created_at DESC) for efficient time-series retrieval.
     *
     * @param walletId - Primary key of the wallet.
     */
    async findByWalletId(walletId: number): Promise<WalletTransaction[]> {
        return this.db(this.table)
            .where({ wallet_id: walletId })
            .orderBy("created_at", "desc");
    }

    /**
     * Finds the single ledger entry associated with an order payment.
     *
     * @param orderId - Primary key of the order.
     * @returns The wallet transaction, or `null` if not yet created.
     */
    async findByOrderId(orderId: number): Promise<WalletTransaction | null> {
        const row = await this.db(this.table)
            .where({ order_id: orderId })
            .first();
        return row ?? null;
    }

    /**
     * Inserts an immutable ledger entry within an existing transaction.
     *
     * @remarks
     * Must always be called in the same transaction as the corresponding
     * `WalletRepository.deductBalance()` or `creditBalance()` call.
     * If the transaction rolls back, both the balance update and this
     * ledger entry roll back together.
     *
     * @param input - Fields for the new ledger row.
     * @param trx   - The active transaction client (required).
     * @returns The newly inserted wallet transaction row.
     */
    async create(
        input: CreateWalletTransactionInput,
        trx: Knex.Transaction,
    ): Promise<WalletTransaction> {
        const [row] = await trx(this.table)
            .insert({
                wallet_id: input.walletId,
                order_id: input.orderId ?? null,
                transaction_type: input.type,
                amount: input.amount,
                balance_before: input.balanceBefore,
                balance_after: input.balanceAfter,
                description: input.description ?? null,
            })
            .returning("*");
        return row;
    }
}
