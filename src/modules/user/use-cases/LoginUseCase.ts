/**
 * @module LoginUseCase
 * @description Authenticates a user and returns a signed JWT.
 *
 * Deliberately returns the same error for wrong email and wrong password
 * (INVALID_CREDENTIALS) to prevent user enumeration attacks.
 *
 * JWT payload carries only { sub: userId, role } - minimal claims.
 * Expiry is read from JWT_EXPIRES_IN env var (default: '7d').
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { LOGGER, Logger } from "utils/logger.js";
import { UnauthorizedError } from "shared/errors/UnauthorizedError.js";
import {
    type IUserRepository,
    USER_REPOSITORY_TOKEN,
} from "modules/user/IUserRepository.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

export interface LoginInput {
    email: string;
    password: string;
}

export interface LoginResult {
    token: string;
    userId: string;
    role: string;
}

@injectable()
export class LoginUseCase {
    constructor(
        @inject(USER_REPOSITORY_TOKEN)
        private readonly userRepo: IUserRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(input: LoginInput): Promise<LoginResult> {
        const { email, password } = input;

        this.logger.info("[Login] Attempt", { email });

        // Same error for "no such email" and "wrong password" - prevent enumeration
        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            throw new UnauthorizedError(ErrorKeys.INVALID_CREDENTIALS);
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash,
        );
        if (!passwordMatch) {
            this.logger.warn("[Login] Wrong password", { email });
            throw new UnauthorizedError(ErrorKeys.INVALID_CREDENTIALS);
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error("JWT_SECRET environment variable is not set");
        }

        const token = jwt.sign({ sub: user.id, role: user.role }, secret, {
            expiresIn: (process.env.JWT_EXPIRES_IN ??
                "7d") as jwt.SignOptions["expiresIn"],
        });

        this.logger.info("[Login] Success", {
            userId: user.id,
            role: user.role,
        });

        return { token, userId: user.id, role: user.role };
    }
}
