import "reflect-metadata";
import { container } from "tsyringe";
import { OrderItemRepository } from "./OrderItemRepository.js";
import { ORDER_ITEM_REPOSITORY_TOKEN } from "./IOrderItemRepository.js";

export function registerOrderItemsModule(): void {
    container.registerSingleton<OrderItemRepository>(
        ORDER_ITEM_REPOSITORY_TOKEN,
        OrderItemRepository,
    );
}