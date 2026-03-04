/**
 * @module user/container
 * @description Registers user module dependencies into the tsyringe container.
 *
 * Binds `USER_REPOSITORY_TOKEN` to `UserRepository`.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { UserRepository } from "./UserRepository.js";
import { USER_REPOSITORY_TOKEN } from "./IUserRepository.js";
import { DeleteUserUseCase } from "./use-cases/DeleteUserUseCase.js";
import { UpdateUserUseCase } from "./use-cases/UpdateUserUseCase.js";
import { GetUserUseCase } from "./use-cases/GetUserUseCase.js";
import { LoginUseCase } from "modules/user/use-cases/LoginUseCase.js";
import { RegisterUserUseCase } from "./use-cases/RegisterUseCase.js";

/** Registers `UserRepository` as the singleton implementation of `IUserRepository`. */
export function registerUserModule(): void {
    container.registerSingleton<UserRepository>(USER_REPOSITORY_TOKEN, UserRepository);

    container.registerSingleton<RegisterUserUseCase>(RegisterUserUseCase);
    container.registerSingleton<LoginUseCase>(LoginUseCase);
    container.registerSingleton<GetUserUseCase>(GetUserUseCase);
    container.registerSingleton<UpdateUserUseCase>(UpdateUserUseCase);
    container.registerSingleton<DeleteUserUseCase>(DeleteUserUseCase);
}