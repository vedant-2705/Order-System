/**
 * @module ProductController
 * @description HTTP layer for product operations.
 *
 * Route map (registered in product.routes.ts):
 *   GET    /api/v1/products          -> getAll     (public)
 *   GET    /api/v1/products/:id      -> getById    (public)
 *   POST   /api/v1/products          -> create     (admin only)
 *   PATCH  /api/v1/products/:id      -> update     (admin only)
 *   DELETE /api/v1/products/:id      -> delete     (admin only)
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { GetProductUseCase } from "./use-cases/GetProductUseCase.js";
import { CreateProductUseCase } from "./use-cases/CreateProductUseCase.js";
import { UpdateProductUseCase } from "./use-cases/UpdateProductUseCase.js";
import { DeleteProductUseCase } from "./use-cases/DeleteProductUseCase.js";
import { IdParam } from "schemas/common.js";
import {
    ListProductsQuery,
    CreateProductBody,
    UpdateProductBody,
} from "./schemas.js";

@injectable()
export class ProductController {
    constructor(
        @inject(GetProductUseCase)
        private readonly getProductUseCase: GetProductUseCase,

        @inject(CreateProductUseCase)
        private readonly createProductUseCase: CreateProductUseCase,

        @inject(UpdateProductUseCase)
        private readonly updateProductUseCase: UpdateProductUseCase,

        @inject(DeleteProductUseCase)
        private readonly deleteProductUseCase: DeleteProductUseCase,
    ) {}

    getAll = async (req: Request, res: Response): Promise<void> => {
        const { search } = req.query as unknown as ListProductsQuery;
        const products = await this.getProductUseCase.getAll({ search });
        res.status(StatusCodes.OK).json(
            successResponse(products, { count: products.length }),
        );
    };

    getById = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        const product = await this.getProductUseCase.getById(id);
        res.status(StatusCodes.OK).json(successResponse(product));
    };

    create = async (req: Request, res: Response): Promise<void> => {
        const body = req.body as CreateProductBody;
        const product = await this.createProductUseCase.execute(body);
        res.status(StatusCodes.CREATED).json(
            successResponse(product, { timestamp: new Date().toISOString() }),
        );
    };

    update = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        const body = req.body as UpdateProductBody;
        const product = await this.updateProductUseCase.execute(id, body);
        res.status(StatusCodes.OK).json(successResponse(product));
    };

    delete = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        await this.deleteProductUseCase.execute(id);
        res.status(StatusCodes.NO_CONTENT).send();
    };
}
