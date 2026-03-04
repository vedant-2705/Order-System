/**
 * @module DeleteUserUseCase
 * @description Soft-deletes a user after verifying they have no active orders.
 *
 * Guard: a user with pending/confirmed/processing orders cannot be deleted —
 * those orders represent unresolved financial obligations.
 * Only cancelled/refunded/completed orders are acceptable.
 *
 * Uses soft-delete so FK references from orders + wallet remain valid
 * and the audit trail is preserved.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { ConflictError } from "shared/errors/ConflictError.js";
import {
    type IUserRepository,
    USER_REPOSITORY_TOKEN,
} from "../IUserRepository.js";
import {
    type IOrderRepository,
    ORDER_REPOSITORY_TOKEN,
} from "modules/orders/IOrderRepository.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

/** Order statuses that block user deletion. */
const BLOCKING_STATUSES = new Set(["pending", "confirmed", "processing"]);

@injectable()
export class DeleteUserUseCase {
    constructor(
        @inject(USER_REPOSITORY_TOKEN)
        private readonly userRepo: IUserRepository,

        @inject(ORDER_REPOSITORY_TOKEN)
        private readonly orderRepo: IOrderRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(id: number): Promise<void> {
        this.logger.info("[DeleteUser] Starting", { id });

        // 1. Verify user exists
        const user = await this.userRepo.findById(id);
        if (!user) {
            throw new NotFoundError(ErrorKeys.USER_NOT_FOUND, {
                id: String(id),
            });
        }

        // 2. Check for active orders
        const orders = await this.orderRepo.findByUserId(id);
        const hasActiveOrders = orders.some((o) =>
            BLOCKING_STATUSES.has(o.status),
        );

        if (hasActiveOrders) {
            throw new ConflictError(ErrorKeys.USER_HAS_ACTIVE_ORDERS, {
                id: String(id),
            });
        }

        // 3. Soft delete — stamps deleted_at, preserves FK references
        await this.userRepo.softDelete(id);

        this.logger.info("[DeleteUser] Completed", { id });
    }
}
