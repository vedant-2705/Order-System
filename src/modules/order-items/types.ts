export interface OrderItem {
    id: number;
    order_id: number;
    product_id: number;
    quantity: number;
    price_at_purchase: string;
}

export interface CreateOrderItemInput {
    orderId: number;
    productId: number;
    quantity: number;
    priceAtPurchase: number;
}

export interface CreateOrderRequestItem {
    product_id: number;
    quantity: number;
}