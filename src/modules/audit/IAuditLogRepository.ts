/**
 * @module IAuditLogRepository
 * @description Read-only repository interface for the `audit_logs` table.
 *
 * Injected by `AUDIT_LOG_REPOSITORY_TOKEN`.
 *
 * **Design principle  read-only by intent:**
 * `audit_logs` rows are written exclusively by the PostgreSQL trigger
 * `audit_log_trigger`  never by application code.  Keeping writes
 * inside the DB trigger makes the audit trail tamper-proof at the
 * application layer.
 *
 * Consumer read patterns:
 *   - Admin panel   : "show me all events on order #42"
 *   - Security dash : "show me everything user #7 did"
 *   - Compliance    : "show me all DELETEs in the last 30 days"
 *
 * @see modules/audit/AuditLogRepository.ts
 */
import { AuditLog } from "./types.js";

/** DI injection token for {@link IAuditLogRepository}. */
export const AUDIT_LOG_REPOSITORY_TOKEN = Symbol("IAuditLogRepository");

export interface IAuditLogRepository {
    /**
     * Returns all events for a specific entity.
     * Uses index `idx_audit_logs_entity` (entity_type, entity_id).
     *
     * @example repo.findByEntity('orders', 42) // all events on order 42
     */
    findByEntity(entityType: string, entityId: number): Promise<AuditLog[]>;

    /**
     * Returns all events performed by a specific user.
     * Uses index `idx_audit_logs_performer` (performed_by, created_at DESC).
     */
    findByPerformer(userId: number): Promise<AuditLog[]>;

    /**
     * Returns all events of a given action type.
     *
     * @example repo.findByAction('DELETE') // compliance: all deletes
     */
    findByAction(action: string): Promise<AuditLog[]>;

    /**
     * Returns the most recent events across the entire system.
     * Used by the admin dashboard recent-activity feed.
     */
    findRecent(limit: number): Promise<AuditLog[]>;
}
