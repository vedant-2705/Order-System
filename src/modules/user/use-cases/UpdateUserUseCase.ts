import { injectable, inject } from "tsyringe";
import { type IUserRepository, USER_REPOSITORY_TOKEN } from "../IUserRepository.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { ConflictError } from "shared/errors/ConflictError.js";
import { UpdateUserInput, User } from "../types.js";
import * as bcrypt from "bcrypt";
import { ErrorKeys } from "constants/ErrorCodes.js";

const SALT_ROUNDS = 12;

export interface UpdateUserRequest {
    name?: string;
    email?: string;
    password?: string;
    role?: "admin" | "customer";
}

export type SafeUser = Omit<User, "password_hash">;

@injectable()
export class UpdateUserUseCase {
    constructor(
        @inject(USER_REPOSITORY_TOKEN)
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(id: number, input: UpdateUserRequest): Promise<SafeUser> {
        const existing = await this.userRepo.findById(id);
        if (!existing) throw new NotFoundError("USER_NOT_FOUND");

        if (input.email && input.email !== existing.email) {
            const conflict = await this.userRepo.findByEmail(input.email);
            if (conflict) throw new ConflictError(ErrorKeys.USER_EMAIL_TAKEN, { email: input.email });
        }

        const updatePayload: UpdateUserInput = {};
        if (input.name !== undefined) updatePayload.name = input.name;
        if (input.email !== undefined) updatePayload.email = input.email;
        if (input.role !== undefined) updatePayload.role = input.role;
        if (input.password !== undefined) {
            updatePayload.password_hash = await bcrypt.hash(
                input.password,
                SALT_ROUNDS,
            );
        }

        const updated = await this.userRepo.update(id, updatePayload);
        if (!updated) throw new NotFoundError("USER_NOT_FOUND");

        const { password_hash: _, ...safeUser } = updated;
        return safeUser;
    }
}
