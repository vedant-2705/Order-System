import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IUserRepository } from "./IUserRepository.js";
import { User } from "./types.js";

@singleton()
export class UserRepository
    extends BaseRepository<User>
    implements IUserRepository
{
    protected readonly table = "users";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider
    ) {
        super(dbProvider);
    }

    // Hits idx_users_email  called on every login.
    async findByEmail(email: string): Promise<User | null> {
        const row = await this.query()
            .where({ email })
            .first();
        return row ?? null;
    }

    async create(data: Partial<User>, trx?: Knex.Transaction): Promise<User> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb.insert(data).returning("*");
        return row;
    }

    async update(
        id: number,
        data: Partial<User>,
        trx?: Knex.Transaction,
    ): Promise<User | null> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb
            .where({ id })
            .update({ ...data, updated_at: this.db.fn.now() })
            .returning("*");
        return row ?? null;
    }
}
