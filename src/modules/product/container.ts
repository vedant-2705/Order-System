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
import { GetProductUseCase } from "./use-cases/GetProductUseCase.js";
import { ProductController } from "./ProductController.js";

/** Registers `ProductRepository` as the singleton implementation of `IProductRepository`. */
export function registerProductModule(): void {
    container.registerSingleton<ProductRepository>(
        PRODUCT_REPOSITORY_TOKEN,
        ProductRepository,
    );

    container.registerSingleton<GetProductUseCase>(GetProductUseCase);

    container.registerSingleton<ProductController>(ProductController);
}
