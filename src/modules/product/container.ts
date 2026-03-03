import "reflect-metadata";
import { container } from "tsyringe";
import { ProductRepository } from "./ProductRepository.js";
import { PRODUCT_REPOSITORY_TOKEN } from "./IProductRepository.js";

export function registerProductModule(): void {
    container.registerSingleton<ProductRepository>(
        PRODUCT_REPOSITORY_TOKEN,
        ProductRepository,
    );
}
