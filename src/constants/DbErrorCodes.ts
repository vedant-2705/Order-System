/**
 * @module DbErrorCodes
 * @description PostgreSQL error codes for the `pg` driver.
 * Avoids magic strings when catching DB-level constraint violations.
 *
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 *
 * pg driver surfaces these on: error.code
 * e.g. catch (err) { if (err.code === DbErrorCodes.UNIQUE_VIOLATION) { ... } }
 */

import { ErrorCode } from "./ErrorCodes.js";

export const DbErrorCodes = {
    /**
     * unique_violation (23505)
     * Thrown when an INSERT/UPDATE violates a UNIQUE constraint.
     * e.g. duplicate email, duplicate SKU, duplicate order_number
     */
    UNIQUE_VIOLATION: "23505",

    /**
     * foreign_key_violation (23503)
     * Thrown when an INSERT/UPDATE references a row that doesn't exist.
     * e.g. order referencing a deleted user_id
     */
    FOREIGN_KEY_VIOLATION: "23503",

    /**
     * not_null_violation (23502)
     * Thrown when a NOT NULL column receives a null value.
     */
    NOT_NULL_VIOLATION: "23502",

    /**
     * check_violation (23514)
     * Thrown when a CHECK constraint is violated.
     * e.g. balance < 0, stock < 0, price <= 0
     */
    CHECK_VIOLATION: "23514",

    /**
     * serialization_failure (40001)
     * Thrown under SERIALIZABLE isolation when PostgreSQL detects
     * a read/write dependency cycle. Transaction must be retried.
     */
    SERIALIZATION_FAILURE: "40001",

    /**
     * deadlock_detected (40P01)
     * Thrown when PostgreSQL's deadlock detector fires.
     * Prevented by consistent lock ordering (ORDER BY id in findByIdsForUpdate).
     */
    DEADLOCK_DETECTED: "40P01",
} as const;

/**
 * Maps each PostgreSQL error code to an ErrorCode key from ERROR_CODES.
 * DbErrorHelper reads this map  no switch, no hardcoded strings.
 */
export const DB_ERROR_MAP: Record<string, ErrorCode> = {
    [DbErrorCodes.UNIQUE_VIOLATION]: "CONFLICT",
    [DbErrorCodes.FOREIGN_KEY_VIOLATION]: "VALIDATION_FAILED",
    [DbErrorCodes.NOT_NULL_VIOLATION]: "VALIDATION_FAILED",
    [DbErrorCodes.CHECK_VIOLATION]: "VALIDATION_FAILED",
    [DbErrorCodes.SERIALIZATION_FAILURE]: "CONFLICT",
    [DbErrorCodes.DEADLOCK_DETECTED]: "CONFLICT",
};
    