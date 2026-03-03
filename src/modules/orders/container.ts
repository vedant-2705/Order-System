import "reflect-metadata";
import { container } from "tsyringe";
import { OrderRepository } from "./OrderRepository.js";
import { ORDER_REPOSITORY_TOKEN } from "./IOrderRepository.js";

export function registerOrderModule(): void {
    container.registerSingleton<OrderRepository>(ORDER_REPOSITORY_TOKEN, OrderRepository);
}