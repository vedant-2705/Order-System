/**
 * @module UserRepository
 * @description Data-access layer for the `users` table.
 *
 * `findByEmail` is the primary lookup path — called on every login.
 * Uses index `idx_users_email` so lookups are O(log n).
 *
 * All reads go through `this.query()` from `BaseRepository`, which
 * automatically excludes soft-deleted users.
 */
import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IUserRepository } from "./IUserRepository.js";
import { CreateUserInput, UpdateUserInput, User } from "./types.js";

@singleton()
export class UserRepository
    extends BaseRepository<User>
    implements IUserRepository
{
    protected readonly table = "users";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider,
    ) {
        super(dbProvider);
    }

    async findByEmail(email: string): Promise<User | null> {
        const row = await this.query().where({ email }).first();
        return row ?? null;
    }

    async create(data: CreateUserInput, trx?: Knex.Transaction): Promise<User> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb.insert(data).returning("*");
        return row;
    }

    async update(
        id: number,
        data: UpdateUserInput,
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
