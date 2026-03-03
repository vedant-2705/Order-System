import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { CreateWalletTransactionInput, WalletTransaction } from "./types.js";
import { IWalletTransactionRepository } from "./IWalletTransactionRepository.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { Knex } from "knex";

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

    // Hits idx_wallet_transactions_wallet_created.
    async findByWalletId(walletId: number): Promise<WalletTransaction[]> {
        return this.db(this.table)
            .where({ wallet_id: walletId })
            .orderBy("created_at", "desc");
    }

    async findByOrderId(orderId: number): Promise<WalletTransaction | null> {
        const row = await this.db(this.table)
            .where({ order_id: orderId })
            .first();
        return row ?? null;
    }

    // Always inside a transaction  atomic with wallet.balance update.
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
