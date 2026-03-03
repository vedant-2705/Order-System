import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IOrderRepository } from "./IOrderRepository.js";
import {
    Order,
    OrderStatus,
} from "./types.js";

//  OrderRepository 

@singleton()
export class OrderRepository
    extends BaseRepository<Order>
    implements IOrderRepository
{
    protected readonly table = "orders";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider
    ) {
        super(dbProvider);
    }

    async findByOrderNumber(orderNumber: string): Promise<Order | null> {
        const row = await this.query()
            .where({ order_number: orderNumber })
            .first();
        return row ?? null;
    }

    // Hits idx_orders_user_created (user_id, created_at DESC).
    async findByUserId(userId: number): Promise<Order[]> {
        return this.query()
            .where({ user_id: userId })
            .orderBy("created_at", "desc");
    }

    // Always called inside createOrder transaction.
    // order_number is auto-set by DB trigger  not passed in.
    async create(data: Partial<Order>, trx: Knex.Transaction): Promise<Order> {
        const [row] = await trx(this.table).insert(data).returning("*");
        return row;
    }

    async updateStatus(
        id: number,
        status: OrderStatus,
        trx?: Knex.Transaction,
    ): Promise<Order | null> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb
            .where({ id })
            .update({ status, updated_at: this.db.fn.now() })
            .returning("*");
        return row ?? null;
    }
}
