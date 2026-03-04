/**
 * @module express.d.ts
 * @description Augments Express Request to include the authenticated user.
 *
 * Set by authMiddleware after JWT verification.
 * Consumed by controllers and requireRole middleware.
 *
 * Using declaration merging so req.user is typed everywhere without casting.
 */
import { UserType } from "modules/user/types.js";

declare global {
    namespace Express {
        interface Request {
            /**
             * Populated by authMiddleware after successful JWT verification.
             * Undefined on unauthenticated routes (public endpoints).
             */
            user?: {
                id: number;
                role: UserType;
            };
        }
    }
}
