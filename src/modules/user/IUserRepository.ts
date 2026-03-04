/**
 * @module IUserRepository
 * @description Repository interface for the `users` table.
 *
 * Injected by `USER_REPOSITORY_TOKEN`.
 * Token is co-located with the interface  no separate token file needed.
 */
import { Knex } from "knex";
import { CreateUserInput, UpdateUserInput, User } from "./types.js";

/** DI injection token for {@link IUserRepository}. */
export const USER_REPOSITORY_TOKEN = Symbol("IUserRepository");

export interface IUserRepository {
    findById(id: number): Promise<User | null>;
    findAll(): Promise<User[]>;
    findByEmail(email: string): Promise<User | null>;
    create(input: CreateUserInput, trx?: Knex.Transaction): Promise<User>;
    update(
        id: number,
        input: UpdateUserInput,
        trx?: Knex.Transaction,
    ): Promise<User | null>;
    softDelete(id: number, trx?: Knex.Transaction): Promise<boolean>;

    hardDelete(id: number, trx?: Knex.Transaction): Promise<boolean>;
}
    