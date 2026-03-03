import { AuditLog } from "./types.js";

// Token co-located with interface  no separate tokens file.
export const AUDIT_LOG_REPOSITORY_TOKEN = Symbol("IAuditLogRepository");

//  IAuditLogRepository 
// READ-ONLY repository.
//
// audit_logs rows are written exclusively by the PostgreSQL trigger
// (audit_log_trigger)  never by application code.
// This prevents the audit trail from being tampered with at the app layer.
//
// The only thing the application does with audit_logs is READ them:
//   - Admin panel: "show me all events on order #42"
//   - Security dashboard: "show me everything user #7 did"
//   - Compliance: "show me all DELETEs in the last 30 days"

export interface IAuditLogRepository {
    // "Show everything that happened to a specific entity"
    // e.g. findByEntity('orders', 42) -> all INSERT/UPDATE/DELETE on order 42
    // Hits: idx_audit_logs_entity (entity_type, entity_id)
    findByEntity(entityType: string, entityId: number): Promise<AuditLog[]>;

    // "Show everything a specific user did"
    // Hits: idx_audit_logs_performer (performed_by, created_at DESC)
    findByPerformer(userId: number): Promise<AuditLog[]>;

    // "Show all events of a specific action type"
    // e.g. findByAction('DELETE') for compliance reports
    findByAction(action: string): Promise<AuditLog[]>;

    // "Show recent activity across the system"  admin dashboard
    findRecent(limit: number): Promise<AuditLog[]>;
}
