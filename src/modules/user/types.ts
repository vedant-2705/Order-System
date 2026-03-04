/**
 * @module user/types
 * @description Domain types for the user module.
 */

export type UserType = "admin" | "customer";

/** Database row shape for the `users` table. */
export interface User {
    id: number;
    name: string;
    email: string;
    password_hash: string;
    role: UserType;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}

export interface CreateUserInput {
    name: string;
    email: string;
    password_hash: string;
    role?: UserType;
}

export interface UpdateUserInput {
    name?: string;
    email?: string;
    password_hash?: string;
    role?: UserType;
}
