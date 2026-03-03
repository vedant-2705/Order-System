import "reflect-metadata";
import { inject, injectable } from "tsyringe";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { BaseRepository } from "shared/BaseRepository.js";
import { IAuditLogRepository } from "./IAuditLogRepository.js";
import { AuditLog } from "./types.js";

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

    // Hits idx_audit_logs_entity (entity_type, entity_id).
    // Returns newest first  most recent events are most relevant.
    async findByEntity(
        entityType: string,
        entityId: number,
    ): Promise<AuditLog[]> {
        return this.db(this.table)
            .where({ entity_type: entityType, entity_id: entityId })
            .orderBy("created_at", "desc");
    }

    // Hits idx_audit_logs_performer (performed_by, created_at DESC).
    async findByPerformer(userId: number): Promise<AuditLog[]> {
        return this.db(this.table)
            .where({ performed_by: userId })
            .orderBy("created_at", "desc");
    }

    async findByAction(action: string): Promise<AuditLog[]> {
        return this.db(this.table)
            .where({ action })
            .orderBy("created_at", "desc");
    }

    // Used for admin dashboard  recent activity feed.
    async findRecent(limit: number = 50): Promise<AuditLog[]> {
        return this.db(this.table).orderBy("created_at", "desc").limit(limit);
    }

    //  No create / update / delete methods 
    // audit_logs is written exclusively by the PostgreSQL trigger.
    // Application code is intentionally locked out of writing to this table.
    // If you need to add a method here, ask: should this really bypass
    // the trigger? Almost certainly the answer is no.
}
