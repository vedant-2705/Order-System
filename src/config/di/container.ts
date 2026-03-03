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

//  Root Container 
// Single entry point for all DI registration.
// Called once at application startup in src/index.ts.
//
// Registration order matters for dependencies:
//   1. Infrastructure (DB, logger) - no dependencies
//   2. Repositories                - depend on DB
//   3. Services                    - depend on repositories
//   4. Use cases                   - depend on services + repositories
//   5. Controllers                 - depend on use cases
//
// Each module has its own container file (OrderContainer, WalletContainer)
// to keep this file clean. They're imported here to trigger registration.

export function registerDependencies(): void {
    //  Infrastructure 
    // DatabaseProvider is @singleton() - tsyringe auto-registers it.
    // Calling register() here is optional but makes it explicit and
    // ensures it's available before any repository tries to use it.
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

//  Resolve helper 
// Thin wrapper around container.resolve() for cleaner call sites.
// Usage: resolve(OrderController)
export function resolve<T>(token: new (...args: any[]) => T): T {
    return container.resolve(token);
}

export { container };
