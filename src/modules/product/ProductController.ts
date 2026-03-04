/**
 * @module ProductController
 * @description HTTP layer for product read operations.
 *
 * Products are read-only at this stage - write operations (create, update,
 * soft-delete) will be added in a future session when admin routes are built.
 *
 * ProductController injects `IProductRepository` directly rather than going
 * through a dedicated use case class.  This is intentional: the only logic
 * here is fetch + 404 check, which does not justify a separate use-case class.
 * When product writes are added, a `ProductUseCase` will be introduced and
 * this controller will be updated to inject it.
 *
 * All methods are bound arrow functions for consistent `router.get(path, asyncHandler(...))`
 * usage without losing `this`.
 *
 * Route map (registered in product.routes.ts):
 *   GET    /api/v1/products          -> getAll
 *   GET    /api/v1/products/:id      -> getById
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { GetProductUseCase } from "./use-cases/GetProductUseCase.js";
import { IdParam } from "schemas/common.js";
import { ListProductsQuery } from "./schemas.js";

@injectable()
export class ProductController {
    constructor(
        @inject(GetProductUseCase)
        private readonly getProductUseCase: GetProductUseCase,
    ) {}

    /**
     * GET /api/v1/products
     *
     * Returns all active (non-deleted, in-stock) products.
     * Supports optional ?search= query param for name filtering.
     * req.query is pre-validated by validateQuery(listProductsQuerySchema).
     */
    getAll = async (req: Request, res: Response): Promise<void> => {
        const { search } = req.query as unknown as ListProductsQuery;

        const products = await this.getProductUseCase.getAll({ search });

        res.status(StatusCodes.OK).json(
            successResponse(products, { count: products.length }),
        );
    };

    /**
     * GET /api/v1/products/:id
     *
     * Returns a single active product by its internal PK.
     * req.params.id is pre-validated and coerced by validateParams(idParamSchema).
     * Responds 200 with the product, or 404 if not found or soft-deleted.
     */
    getById = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;

        const product = await this.getProductUseCase.getById(id);

        res.status(StatusCodes.OK).json(successResponse(product));
    };
}
