export interface Product {
    id: number;
    name: string;
    description: string | null;
    price: string; // DECIMAL -> string from pg driver
    sku: string;
    stock: number;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}
