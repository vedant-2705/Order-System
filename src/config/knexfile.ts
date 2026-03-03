/**
 * @module knexfile
 * @description Knex configuration for all runtime environments.
 *
 * Reads connection details exclusively from environment variables so that
 * no credentials are ever committed to source control.
 *
 * Environments:
 *   development - debug mode on, SSL off, lenient pool settings
 *   production  - debug mode off, SSL required, same pool formula
 *
 * Pool sizing formula:
 *   max = (num_cores * 2) + 1  (PostgreSQL best-practice)
 *   e.g. 4-core server -> max 9, rounded up to 10
 *
 * @see https://knexjs.org/guide/#configuration-options
 */
import type { Knex } from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const config: { [key: string]: Knex.Config } = {
    development: {
        client: "pg",
        connection: {
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || "order_system",
            user: process.env.DB_USER || "postgres",
            password: process.env.DB_PASSWORD || "password",
        },

        // Connection Pool
        // min: keep 2 connections warm at all times - avoids cold start latency
        //      on first requests after idle periods
        // max: cap at 10 - beyond this PostgreSQL process overhead outweighs gains
        //      Formula: (num_cores * 2) + 1 = (4 * 2) + 1 ≈ 10 for a 4-core server
        pool: {
            min: Number(process.env.DB_POOL_MIN) || 2,
            max: Number(process.env.DB_POOL_MAX) || 10,

            // How long to wait for a connection before throwing (ms)
            acquireTimeoutMillis: 30_000,

            // How long to wait when creating a new connection (ms)
            createTimeoutMillis: 30_000,

            // How long to wait when destroying a connection (ms)
            destroyTimeoutMillis: 5_000,

            // Close connections idle longer than this (ms)
            // Keeps pool lean during low-traffic periods
            idleTimeoutMillis: 30_000,

            // How often to check for idle connections to close (ms)
            reapIntervalMillis: 1_000,

            // Wait before retrying a failed connection creation (ms)
            createRetryIntervalMillis: 100,
        },

        // Migrations 
        migrations: {
            directory: path.join(process.cwd(), "../db/migrations"),
            tableName: "knex_migrations",
            extension: "ts",
        },

        // Seeds
        seeds: {
            directory: path.join(process.cwd(), "../db/seeds"),
            extension: "ts",
        },

        // Log all queries in development - invaluable for ORM vs Raw SQL comparison
        debug: process.env.NODE_ENV === "development",
    },

    production: {
        client: "postgresql",
        connection: {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            // SSL required in production
            ssl: { rejectUnauthorized: true },
        },
        pool: {
            min: 2,
            max: 10,
            acquireTimeoutMillis: 30_000,
            createTimeoutMillis: 30_000,
            destroyTimeoutMillis: 5_000,
            idleTimeoutMillis: 30_000,
            reapIntervalMillis: 1_000,
            createRetryIntervalMillis: 100,
        },
        migrations: {
            directory: path.join(process.cwd(), "../db/migrations"),
            tableName: "knex_migrations",
            extension: "ts",
        },
        seeds: {
            directory: path.join(process.cwd(), "../db/seeds"),
            extension: "ts",
        },
        debug: false,
    },
};

export default config;
