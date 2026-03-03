import { UserRole } from "./enum.js";

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
