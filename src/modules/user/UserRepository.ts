/**
 * @module UserRepository
 * @description Data-access layer for the `users` table.
 *
 * `findByEmail` is the primary lookup path  called on every login.
 * It uses index `idx_users_email` so lookups are O(log n).
 *
 * All reads go through `this.query()` from `BaseRepository`, which
 * automatically excludes soft-deleted users.
 *
 * @see shared/BaseRepository.ts
 * @see modules/user/IUserRepository.ts
 */
import "reflect-metadata";
import { inject, singleton } from "tsyringe";
import { Knex } from "knex";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IUserRepository } from "./IUserRepository.js";
import { User } from "./types.js";

/**
 * Concrete repository for the `users` table.
 *
 * @remarks
 * `@singleton()` ensures one instance per process so all injections
 * share the same Knex connection pool reference.
 */
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

    /**
     * Finds an active user by email address.
     *
     * @remarks
     * This is the authentication lookup path, called on every login.
     * Uses index `idx_users_email` so the query is O(log n).
     *
     * @param email - The email address to look up (case-sensitive).
     * @returns The user, or `null` if not found or soft-deleted.
     */
    async findByEmail(email: string): Promise<User | null> {
        const row = await this.query()
            .where({ email })
            .first();
        return row ?? null;
    }

    /**
     * Inserts a new user row.
     *
     * @param data - Partial user fields to insert.
     * @param trx  - Optional transaction client.
     * @returns The newly created user row.
     */
    async create(data: Partial<User>, trx?: Knex.Transaction): Promise<User> {
        const qb = trx ? trx(this.table) : this.db(this.table);
        const [row] = await qb.insert(data).returning("*");
        return row;
    }

    /**
     * Updates user fields.
     *
     * @param id   - Primary key of the user.
     * @param data - Partial user fields to change.
     * @param trx  - Optional transaction client.
     * @returns The updated user, or `null` if not found.
     */
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
