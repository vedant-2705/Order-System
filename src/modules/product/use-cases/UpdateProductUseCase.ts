/**
 * @module UpdateProductUseCase
 * @description Updates product fields with SKU conflict detection on change.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { LOGGER, Logger } from "utils/logger.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { ConflictError } from "shared/errors/ConflictError.js";
import {
    type IProductRepository,
    PRODUCT_REPOSITORY_TOKEN,
} from "../IProductRepository.js";
import { Product } from "../types.js";
import { ErrorKeys } from "constants/ErrorCodes.js";

export interface UpdateProductInput {
    name?: string;
    description?: string;
    price?: number;
    sku?: string;
    stock?: number;
}

@injectable()
export class UpdateProductUseCase {
    constructor(
        @inject(PRODUCT_REPOSITORY_TOKEN)
        private readonly productRepo: IProductRepository,

        @inject(LOGGER)
        private readonly logger: Logger,
    ) {}

    async execute(id: string, input: UpdateProductInput): Promise<Product> {
        this.logger.info("[UpdateProduct] Starting", { id });

        const existing = await this.productRepo.findById(id);
        if (!existing) {
            throw new NotFoundError(ErrorKeys.PRODUCT_NOT_FOUND, {
                id: String(id),
            });
        }

        // If SKU is changing, check the new SKU isn't already taken
        if (input.sku && input.sku !== existing.sku) {
            const skuConflict = await this.productRepo.findBySku(input.sku);
            if (skuConflict) {
                throw new ConflictError(ErrorKeys.PRODUCT_SKU_TAKEN, {
                    sku: input.sku,
                });
            }
        }

        const updateData: Partial<Product> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.description !== undefined)
            updateData.description = input.description ?? null;
        if (input.sku !== undefined) updateData.sku = input.sku;
        if (input.stock !== undefined) updateData.stock = input.stock;
        if (input.price !== undefined) updateData.price = String(input.price);

        const updated = await this.productRepo.update(id, updateData);
        if (!updated) {
            throw new NotFoundError(ErrorKeys.PRODUCT_NOT_FOUND, {
                id: String(id),
            });
        }

        this.logger.info("[UpdateProduct] Completed", { id });
        return updated;
    }
}
