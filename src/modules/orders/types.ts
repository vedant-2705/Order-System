import { CreateOrderRequestItem, OrderItem } from "modules/order-items/types.js";

export type OrderStatus =
    | "pending"
    | "confirmed"
    | "processing"
    | "completed"
    | "cancelled"
    | "refunded";

export interface Order {
    id: number;
    user_id: number;
    order_number: string;
    total_amount: string;
    status: OrderStatus;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}


//  Input types 

export interface CreateOrderInput {
    userId: number;
    items: CreateOrderRequestItem[];
    notes?: string;
}

export interface CreateOrderResult {
    order: Order;
    items: OrderItem[];
}
