/**
 * @module product/container
 * @description Registers product module dependencies into the tsyringe container.
 *
 * Binds `PRODUCT_REPOSITORY_TOKEN` to `ProductRepository`.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { ProductRepository } from "./ProductRepository.js";
import { PRODUCT_REPOSITORY_TOKEN } from "./IProductRepository.js";

/** Registers `ProductRepository` as the singleton implementation of `IProductRepository`. */
export function registerProductModule(): void {
    container.registerSingleton<ProductRepository>(
        PRODUCT_REPOSITORY_TOKEN,
        ProductRepository,
    );
}
