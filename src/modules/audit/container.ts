import "reflect-metadata";
import { container } from "tsyringe";
import { AuditLogRepository } from "./AuditLogRepository.js";
import { AUDIT_LOG_REPOSITORY_TOKEN } from "./IAuditLogRepository.js";

export function registerAuditLogModule(): void {
    container.registerSingleton<AuditLogRepository>(
        AUDIT_LOG_REPOSITORY_TOKEN,
        AuditLogRepository,
    );
}