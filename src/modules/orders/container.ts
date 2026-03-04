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
import { GetOrderUseCase } from "./use-cases/GetOrderUseCase.js";
import { CreateOrderUseCase } from "./use-cases/CreateOrderUseCase.js";
import { OrderController } from "./OrderController.js";
import { CancelOrderUseCase } from "./use-cases/CancelOrderUseCase.js";

/** Registers `OrderRepository` as the singleton implementation of `IOrderRepository`. */
export function registerOrderModule(): void {
    container.registerSingleton<OrderRepository>(ORDER_REPOSITORY_TOKEN, OrderRepository);

    container.registerSingleton<GetOrderUseCase>(GetOrderUseCase);
    container.registerSingleton<CreateOrderUseCase>(CreateOrderUseCase);
    
    container.registerSingleton<CancelOrderUseCase>(CancelOrderUseCase);

    container.registerSingleton<OrderController>(OrderController);
}