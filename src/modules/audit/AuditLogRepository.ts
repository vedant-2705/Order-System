/**
 * @module AuditLogRepository
 * @description Read-only data-access layer for the `audit_logs` table.
 *
 * **Write path**: rows are inserted exclusively by the PostgreSQL trigger
 * `audit_log_trigger`.  Application code has no write methods here by design
 *  the audit trail must be untamperable at the application layer.
 *
 * **Read path**: this repository exposes query methods for admin panels,
 * security dashboards, and compliance reports.
 *
 * Index coverage:
 *   - `idx_audit_logs_entity`    -> (entity_type, entity_id)
 *   - `idx_audit_logs_performer` -> (performed_by, created_at DESC)
 *
 * @see modules/audit/IAuditLogRepository.ts
 * @see db/migrations/20260303082814_create_audit_trigger.ts
 */
import "reflect-metadata";
import { inject, injectable } from "tsyringe";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IAuditLogRepository } from "./IAuditLogRepository.js";
import { AuditLog } from "./types.js";

/**
 * Concrete repository for the `audit_logs` table (read-only).
 *
 * @remarks
 * There are deliberately **no** `create`, `update`, or `delete` methods.
 * All writes happen via the PostgreSQL trigger.  If you feel you need a
 * write method here, reconsider: application-level writes would bypass
 * the trigger and corrupt the audit trail.
 */
@injectable()
export class AuditLogRepository
    extends BaseRepository<AuditLog>
    implements IAuditLogRepository
{
    protected readonly table = "audit_logs";

    constructor(
        @inject(DATABASE_PROVIDER)
        private readonly dbProvider: DatabaseProvider
    ) {
        super(dbProvider);
    }

    /**
     * Returns all audit events for a specific entity, newest first.
     *
     * @remarks
     * Uses index `idx_audit_logs_entity` (entity_type, entity_id).
     * Typical use-case: "show me everything that happened to order #42".
     *
     * @param entityType - Table name of the entity, e.g. `'orders'`.
     * @param entityId   - Primary key of the entity.
     * @returns Audit log rows ordered by `created_at DESC`.
     */
    async findByEntity(
        entityType: string,
        entityId: number,
    ): Promise<AuditLog[]> {
        return this.db(this.table)
            .where({ entity_type: entityType, entity_id: entityId })
            .orderBy("created_at", "desc");
    }

    /**
     * Returns all audit events performed by a specific user, newest first.
     *
     * @remarks
     * Uses index `idx_audit_logs_performer` (performed_by, created_at DESC).
     * Typical use-case: security dashboard  "show me everything user #7 did".
     *
     * @param userId - Primary key of the user (`users.id`).
     * @returns Audit log rows ordered by `created_at DESC`.
     */
    async findByPerformer(userId: number): Promise<AuditLog[]> {
        return this.db(this.table)
            .where({ performed_by: userId })
            .orderBy("created_at", "desc");
    }

    /**
     * Returns all audit events of a specific action type, newest first.
     *
     * @param action - One of the `AuditAction` values, e.g. `'DELETE'`.
     * @returns Audit log rows ordered by `created_at DESC`.
     *
     * @example
     * // Compliance report: all soft-deletes in the system
     * const deletes = await repo.findByAction('DELETE');
     */
    async findByAction(action: string): Promise<AuditLog[]> {
        return this.db(this.table)
            .where({ action })
            .orderBy("created_at", "desc");
    }

    /**
     * Returns the most recent audit events across the entire system.
     *
     * @remarks
     * Used by the admin dashboard recent-activity feed.
     *
     * @param limit - Maximum number of rows to return (default `50`).
     * @returns The `limit` most recent audit log rows.
     */
    async findRecent(limit: number = 50): Promise<AuditLog[]> {
        return this.db(this.table).orderBy("created_at", "desc").limit(limit);
    }
}
