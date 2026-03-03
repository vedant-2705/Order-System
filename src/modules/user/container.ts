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

/** Registers `UserRepository` as the singleton implementation of `IUserRepository`. */
export function registerUserModule(): void {
    container.registerSingleton<UserRepository>(USER_REPOSITORY_TOKEN, UserRepository);
}