/**
 * @module container
 * @description Root dependency injection container.
 *
 * Single entry point for all tsyringe registrations.
 * Called once at application startup before any `container.resolve()` call.
 *
 * Each feature module owns its own `container.ts` file to keep this file clean.
 * They are imported here solely to trigger their registrations.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { Logger, LOGGER, logger } from "utils/logger.js";
import { DATABASE_PROVIDER, DatabaseProvider } from "db/DatabaseProvider.js";
import { registerUserModule } from "modules/user/container.js";
import { registerOrderModule } from "modules/orders/container.js";
import { registerProductModule } from "modules/product/container.js";
import { registerWalletTransactionModule } from "modules/wallet-transaction/container.js";
import { registerAuditLogModule } from "modules/audit/container.js";
import { registerWalletModule } from "modules/wallet/container.js";
import { registerOrderItemsModule } from "modules/order-items/container.js";


/**
 * Registers all application dependencies into the tsyringe container.
 *
 * @remarks
 * Must be called once at process startup before any `container.resolve()`
 * or `@inject()` resolution occurs.  All `@singleton()` classes are
 * created lazily on first resolution, but they must be registered here first.
 *
 * Delegates to each module's own `registerXxxModule()` to keep this file
 * from growing unbounded as new feature modules are added.
 */
export function registerDependencies(): void {
    // Infrastructure registered first - all other registrations depend on these.
    // DatabaseProvider is @singleton() so tsyringe could auto-register it,
    // but explicit registration here makes the intent clear and ensures
    // it is always available before any repository tries to consume it.
    container.registerSingleton(LOGGER, Logger);
    container.registerSingleton(DATABASE_PROVIDER, DatabaseProvider);

    logger.info("[DI] Infrastructure registered");

    registerUserModule();
    registerOrderModule();
    registerOrderItemsModule();
    registerProductModule();
    registerWalletModule();
    registerWalletTransactionModule();
    registerAuditLogModule();

    logger.info("[DI] All dependencies registered");
}

/**
 * Thin wrapper around `container.resolve()` for clean call sites.
 *
 * @param token - The class constructor to resolve from the container.
 * @returns The singleton instance registered for the given token.
 *
 * @example
 * const db = resolve(DatabaseProvider);
 * await db.ping();
 */
export function resolve<T>(token: new (...args: any[]) => T): T {
    return container.resolve(token);
}

export { container };
