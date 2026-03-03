import { Knex } from "knex";
import { User } from "./types.js";

// Token lives next to the interface - no separate tokens file needed.
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