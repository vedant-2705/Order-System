import "reflect-metadata";
import { container } from "tsyringe";
import { UserRepository } from "./UserRepository.js";
import { USER_REPOSITORY_TOKEN } from "./IUserRepository.js";

export function registerUserModule(): void {
    container.registerSingleton<UserRepository>(USER_REPOSITORY_TOKEN, UserRepository);
}