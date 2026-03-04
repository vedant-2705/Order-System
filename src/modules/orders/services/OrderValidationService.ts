/**
 * @module OrderValidationService
 * @description Business validation for the order creation flow.
 *
 * Called by `CreateOrderUseCase` **after** all row-level locks have been
 * acquired (FOR UPDATE), guaranteeing that the data being validated cannot
 * change between the check and the subsequent write.
 *
 * Does NOT open transactions or manage locks  those are the use case’s
 * responsibility.
 *
 * @see modules/orders/use-cases/CreateOrderUseCase.ts
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Logger } from "utils/logger.js";
import { NotFoundError } from "shared/errors/NotFoundError.js";
import { AppError } from "shared/errors/AppError.js";
import { Product } from "modules/product/types.js";
import { CreateOrderRequestItem } from "modules/order-items/types.js";

/** A single computed order line returned by `OrderValidationService.validate()`. */
export interface ComputedLineItem {
    productId: string;
    quantity: number;
    priceAtPurchase: number;
    subtotal: number;
}

/** Aggregated result of a successful validation pass. */
export interface ValidationResult {
    lineItems: ComputedLineItem[];
    total: number;
}

/**
 * Responsible for:
 *   1. Verifying every requested product exists in the locked product set
 *   2. Validating stock is sufficient for every item
 *   3. Computing line items and order total from DB prices (never client prices)
 *
 * Called from CreateOrderUseCase AFTER locks are acquired 
 * the product rows passed in are already locked FOR UPDATE.
 */
@injectable()
export class OrderValidationService {
    constructor(
        @inject(Logger)
        private readonly logger: Logger,
    ) {}

    validate(
        items: CreateOrderRequestItem[],
        products: Product[],
    ): ValidationResult {
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Verify all requested products exist 
        for (const item of items) {
            if (!productMap.has(item.product_id)) {
                throw new NotFoundError("PRODUCT_NOT_FOUND", {
                    id: String(item.product_id),
                });
            }
        }

        // Validate stock  collect ALL failures before throwing 
        // Better UX: surface all out-of-stock items at once, not one by one.
        const stockErrors: Array<{
            productId: string;
            requested: number;
            available: number;
        }> = [];

        for (const item of items) {
            const product = productMap.get(item.product_id)!;
            if (product.stock < item.quantity) {
                stockErrors.push({
                    productId: item.product_id,
                    requested: item.quantity,
                    available: product.stock,
                });
            }
        }

        if (stockErrors.length > 0) {
            this.logger.warn("[OrderValidation] Insufficient stock", {
                errors: stockErrors,
            });

            // Throw the first error  details for all failures are logged above.
            const first = stockErrors[0];
            throw new AppError("INSUFFICIENT_STOCK", {
                productId: first?.productId as string,
                requested: String(first?.requested),
                available: String(first?.available),
            });
        }

        // Compute line items from DB prices (never trust client prices) 
        let total = 0;
        const lineItems: ComputedLineItem[] = items.map((item) => {
            const product = productMap.get(item.product_id)!;
            const price = parseFloat(product.price); // DECIMAL -> string from pg
            const subtotal = price * item.quantity;
            total += subtotal;

            return {
                productId: item.product_id,
                quantity: item.quantity,
                priceAtPurchase: price,
                subtotal,
            };
        });

        total = Math.round(total * 100) / 100;

        return { lineItems, total };
    }
}
