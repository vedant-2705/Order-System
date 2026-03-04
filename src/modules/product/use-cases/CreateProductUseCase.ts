/**
 * @module CreateProductUseCase
 * @description Creates a new product with SKU uniqueness validation.
 *
 * Two-layer uniqueness check:
 *   1. Application check: findBySku -> clean PRODUCT_SKU_TAKEN error
 *   2. DB safety net: UNIQUE constraint on sku -> caught by ErrorHandler via DB_ERROR_MAP
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { ConflictError } from "shared/errors/ConflictError.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "../IProductRepository.js";
import { Product } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

export interface CreateProductInput {
    name: string;
    description?: string;
    price: number;
    sku: string;
    stock?: number;
}

@injectable()
export class CreateProductUseCase {
    constructor(
        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(input: CreateProductInput): Promise<Product> {
        this.logger.info("[CreateProduct] Starting", { sku: input.sku });

        // Application-level uniqueness check for clean error message
        const existing = await this.productRepo.findBySku(input.sku);
        if (existing) {
            throw new ConflictError(ErrorKeys.PRODUCT_SKU_TAKEN, {
                sku: input.sku,
            });
        }

        const product = await this.productRepo.create({
            name: input.name,
            description: input.description ?? null,
            price: String(input.price),
            sku: input.sku,
            stock: input.stock ?? 0,
        });

        this.logger.info("[CreateProduct] Completed", {
            productId: product.id,
            sku: product.sku,
        });

        return product;
    }
}
