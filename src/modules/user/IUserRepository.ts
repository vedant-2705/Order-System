/**
 * @module IUserRepository
 * @description Repository interface for the `users` table.
 *
 * Injected by `USER_REPOSITORY_TOKEN`.
 * Token is co-located with the interface  no separate token file needed.
 */
import { Knex } from "knex";
import { User } from "./types.js";

/** DI injection token for {@link IUserRepository}. */
export const USER_REPOSITORY_TOKEN = Symbol("IUserRepository");

export interface IUserRepository {
    findById(id: number): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    create(data: Partial<User>, trx?: Knex.Transaction): Promise<User>;
    update(
        id: number,
        data: Partial<User>,
        trx?: Knex.Transaction,
    ): Promise<User | null>;
    softDelete(id: number): Promise<void>;
}