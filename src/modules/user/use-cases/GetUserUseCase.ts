/**
 * @module GetUserUseCase
 * @description Read-only use case for fetching user(s).
 *
 * Always strips `password_hash` before returning — the hash must never
 * leave the service layer, even to internal consumers.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { type IUserRepository, USER_REPOSITORY_TOKEN } from "../IUserRepository.js";
import { User } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

export type SafeUser = Omit<User, "password_hash">;

function strip(user: User): SafeUser {
    const { password_hash: _, ...safe } = user;
    return safe;
}

@injectable()
export class GetUserUseCase {
    constructor(
        @inject(USER_REPOSITORY_TOKEN)
        private readonly userRepo: IUserRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    /**
     * Returns all active (non-deleted) users.
     * password_hash stripped from every row.
     */
    async getAll(): Promise<SafeUser[]> {
        this.logger.debug("[GetUser] Get all");
        const users = await this.userRepo.findAll();
        return users.map(strip);
    }

    /**
     * Returns a single active user by PK.
     * @throws {NotFoundError} USER_NOT_FOUND if not found or soft-deleted.
     */
    async getById(id: number): Promise<SafeUser> {
        this.logger.debug("[GetUser] By ID", { id });
        const user = await this.userRepo.findById(id);
        if (!user) {
            throw new NotFoundError(ErrorKeys.USER_NOT_FOUND, { id: String(id) });
        }
        return strip(user);
    }
}