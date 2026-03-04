/**
 * @module RegisterUserUseCase
 * @description Creates a new user account and an empty wallet atomically.
 *
 * Why user + wallet in one transaction?
 *   A user without a wallet is a broken state - `CreateOrderUseCase` calls
 *   `findByUserIdForUpdate` and throws WALLET_NOT_FOUND if it is missing.
 *   Creating both atomically guarantees they always exist together.
 *   If the wallet INSERT fails for any reason, the user INSERT rolls back too.
 *
 * Email uniqueness strategy (two layers):
 *   1. Application check: `findByEmail` before insert - gives a clean
 *      USER_EMAIL_TAKEN error with the email in the message.
 *   2. DB safety net: UNIQUE constraint on users.email - catches the
 *      edge case where two concurrent registrations pass the app check
 *      simultaneously. The pg UNIQUE_VIOLATION (23505) is caught by the
 *      global ErrorHandler via DB_ERROR_MAP.
 *
 * Password hashing:
 *   bcrypt runs in the use case, never in the controller or repository.
 *   The plain-text password never touches the DB layer.
 *
 * @see modules/wallet/WalletRepository.ts  for wallet creation
 * @see utils/audit/WithAuditContext.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import bcrypt from "bcrypt";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { LOGGER, Logger } from "utils/logger.js";
import { withAuditContext } from "utils/audit/WithAuditContext.js";
import { ConflictError } from "shared/errors/ConflictError.js";
import {
    type IUserRepository,
    USER_REPOSITORY_TOKEN,
} from "../IUserRepository.js";
import {
    type IWalletRepository,
    WALLET_REPOSITORY_TOKEN,
} from "modules/wallet/IWalletRepository.js";
import { User } from "../types.js";
import { UserRole } from "../enum.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

const BCRYPT_ROUNDS = 12;

/** Input accepted by `RegisterUserUseCase.execute()`. */
export interface RegisterUserInput {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
}

/** Value returned by a successful registration - user row without password_hash. */
export type RegisterUserResult = Omit<User, "password_hash">;

@injectable()
export class RegisterUserUseCase {
    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider,

        @inject(USER_REPOSITORY_TOKEN)
        private readonly userRepo: IUserRepository,

        @inject(WALLET_REPOSITORY_TOKEN)
        private readonly walletRepo: IWalletRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(input: RegisterUserInput): Promise<RegisterUserResult> {
        const { name, email, password, role = UserRole.CUSTOMER } = input;

        this.logger.info("[RegisterUser] Starting", { email });

        // Application-level uniqueness check - gives a clean error message.
        // The DB UNIQUE constraint is the final safety net for race conditions.
        const existing = await this.userRepo.findByEmail(email);
        if (existing) {
            throw new ConflictError(ErrorKeys.USER_EMAIL_TAKEN, { email });
        }

        // Hash password before entering the transaction - bcrypt is CPU-bound
        // and slow by design. Doing it inside the transaction would hold the
        // DB connection open unnecessarily during the hashing work.
        const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        return withAuditContext(this.dbProvider.getClient, async (trx) => {
            // INSERT user
            const user = await this.userRepo.create(
                { name, email, password_hash, role },
                trx,
            );

            // INSERT wallet - zero balance, same transaction.
            // If this fails, the user INSERT rolls back automatically.
            await this.walletRepo.create(user.id, trx);

            this.logger.info("[RegisterUser] Completed", {
                userId: user.id,
                email: user.email,
            });

            // Never return password_hash to the caller
            const { password_hash: _, ...safeUser } = user;
            return safeUser as RegisterUserResult;
        });
    }
}
