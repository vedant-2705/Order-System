export type AuditAction =
    | "INSERT"
    | "UPDATE"
    | "DELETE"
    | "LOGIN"
    | "LOGOUT"
    | "FAILED_LOGIN";

export type AuditSource = "api" | "admin_db" | "system";

export interface AuditLog {
    id: number;
    entity_type: string;
    entity_id: number;
    action: AuditAction;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    performed_by: number | null;
    ip_address: string | null;
    user_agent: string | null;
    source: AuditSource;
    created_at: Date;
}
