import { Knex } from "knex";
import { Product } from "./types.js";

export const PRODUCT_REPOSITORY_TOKEN = Symbol("IProductRepository");

export interface IProductRepository {
    findById(id: number): Promise<Product | null>;
    findBySku(sku: string): Promise<Product | null>;
    findAllActive(): Promise<Product[]>;

    // Locks rows FOR UPDATE  prevents concurrent stock deductions.
    // ORDER BY id ensures consistent lock ordering -> prevents deadlocks.
    findByIdsForUpdate(
        ids: number[],
        trx: Knex.Transaction,
    ): Promise<Product[]>;

    create(data: Partial<Product>, trx?: Knex.Transaction): Promise<Product>;
    update(
        id: number,
        data: Partial<Product>,
        trx?: Knex.Transaction,
    ): Promise<Product | null>;

    // Returns true if deduction succeeded, false if insufficient stock.
    deductStock(
        id: number,
        qty: number,
        trx: Knex.Transaction,
    ): Promise<boolean>;

    softDelete(id: number): Promise<void>;
}