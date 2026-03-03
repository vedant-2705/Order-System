/**
 * @module audit/container
 * @description Registers audit module dependencies into the tsyringe container.
 *
 * Binds `AUDIT_LOG_REPOSITORY_TOKEN` to `AuditLogRepository`.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { AuditLogRepository } from "./AuditLogRepository.js";
import { AUDIT_LOG_REPOSITORY_TOKEN } from "./IAuditLogRepository.js";

/** Registers `AuditLogRepository` as the singleton implementation of `IAuditLogRepository`. */
export function registerAuditLogModule(): void {
    container.registerSingleton<AuditLogRepository>(
        AUDIT_LOG_REPOSITORY_TOKEN,
        AuditLogRepository,
    );
}