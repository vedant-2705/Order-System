/**
 * @module order-items/container
 * @description Registers order-items module dependencies into the tsyringe container.
 *
 * Binds `ORDER_ITEM_REPOSITORY_TOKEN` to `OrderItemRepository`.
 * Called from the root DI container during application startup.
 */
import "reflect-metadata";
import { container } from "tsyringe";
import { OrderItemRepository } from "./OrderItemRepository.js";
import { ORDER_ITEM_REPOSITORY_TOKEN } from "./IOrderItemRepository.js";

/** Registers `OrderItemRepository` as the singleton implementation of `IOrderItemRepository`. */
export function registerOrderItemsModule(): void {
    container.registerSingleton<OrderItemRepository>(
        ORDER_ITEM_REPOSITORY_TOKEN,
        OrderItemRepository,
    );
}