/**
 * @module orders/container
 * @description Registers order module dependencies into the tsyringe container.
 *
 * Binds `ORDER_REPOSITORY_TOKEN` to the concrete `OrderRepository` singleton.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { OrderRepository } from "./OrderRepository.js";
import { ORDER_REPOSITORY_TOKEN } from "./IOrderRepository.js";

/** Registers `OrderRepository` as the singleton implementation of `IOrderRepository`. */
export function registerOrderModule(): void {
    container.registerSingleton<OrderRepository>(ORDER_REPOSITORY_TOKEN, OrderRepository);
}