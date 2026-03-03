/**
 * @module user/types
 * @description Domain types for the user module.
 */
import { UserRole } from "./enum.js";

/** Database row shape for the `users` table. */
export interface User {
    id: number;
    name: string;
    email: string;
    password_hash: string;
    role: UserRole;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
