/**
 * @module UserController
 * @description HTTP layer for user operations.
 *
 * Route map (registered in user.routes.ts):
 *   POST   /api/v1/users/register      -> register   (public)
 *   POST   /api/v1/users/login         -> login      (public)
 *   GET    /api/v1/users               -> getAll     (admin only)
 *   GET    /api/v1/users/:id           -> getById    (admin or self)
 *   PATCH  /api/v1/users/:id           -> update     (admin or self)
 *   DELETE /api/v1/users/:id           -> delete     (admin only)
 *
 * Note: specific routes (register, login) registered BEFORE /:id to
 * prevent Express matching them as an :id param.
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { successResponse } from "helpers/ResponseHelper.js";
import { RegisterUserUseCase } from "./use-cases/RegisterUseCase.js";
import { LoginUseCase } from "modules/user/use-cases/LoginUseCase.js";
import { GetUserUseCase } from "./use-cases/GetUserUseCase.js";
import { UpdateUserUseCase } from "./use-cases/UpdateUserUseCase.js";
import { DeleteUserUseCase } from "./use-cases/DeleteUserUseCase.js";
import { RegisterBody, LoginBody, UpdateUserBody } from "./schemas.js";
import { IdParam } from "schemas/common.js";
import { UserRole } from "./enum.js";

@injectable()
export class UserController {
    constructor(
        @inject(RegisterUserUseCase)
        private readonly registerUseCase: RegisterUserUseCase,

        @inject(LoginUseCase)
        private readonly loginUseCase: LoginUseCase,

        @inject(GetUserUseCase)
        private readonly getUserUseCase: GetUserUseCase,

        @inject(UpdateUserUseCase)
        private readonly updateUserUseCase: UpdateUserUseCase,

        @inject(DeleteUserUseCase)
        private readonly deleteUserUseCase: DeleteUserUseCase,
    ) {}

    /**
     * POST /api/v1/users/register
     * Creates a new user account and wallet. Public route.
     */
    register = async (req: Request, res: Response): Promise<void> => {
        const body = req.body as RegisterBody;

        const user = await this.registerUseCase.execute({
            name: body.name,
            email: body.email,
            password: body.password,
            role: body.role as UserRole | undefined,
        });

        res.status(StatusCodes.CREATED).json(
            successResponse(user, { timestamp: new Date().toISOString() }),
        );
    };

    /**
     * POST /api/v1/users/login
     * Returns a JWT on successful authentication. Public route.
     */
    login = async (req: Request, res: Response): Promise<void> => {
        const body = req.body as LoginBody;

        const result = await this.loginUseCase.execute({
            email: body.email,
            password: body.password,
        });

        res.status(StatusCodes.OK).json(successResponse(result));
    };

    /**
     * GET /api/v1/users
     * Returns all active users. Admin only.
     */
    getAll = async (_req: Request, res: Response): Promise<void> => {
        const users = await this.getUserUseCase.getAll();
        res.status(StatusCodes.OK).json(
            successResponse(users, { count: users.length }),
        );
    };

    /**
     * GET /api/v1/users/:id
     * Returns a single user. Admin or the user themselves.
     */
    getById = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        const user = await this.getUserUseCase.getById(id);
        res.status(StatusCodes.OK).json(successResponse(user));
    };

    /**
     * PATCH /api/v1/users/:id
     * Updates user fields. Admin or the user themselves.
     */
    update = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        const body = req.body as UpdateUserBody;

        const user = await this.updateUserUseCase.execute(id, body);
        res.status(StatusCodes.OK).json(successResponse(user));
    };

    /**
     * DELETE /api/v1/users/:id
     * Soft-deletes a user. Blocked if active orders exist. Admin only.
     */
    delete = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params as unknown as IdParam;
        await this.deleteUserUseCase.execute(id);
        res.status(StatusCodes.NO_CONTENT).send();
    };
}
