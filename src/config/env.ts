/**
 * @module validateEnv
 * @description Validates required environment variables at process startup.
 *
 * Called ONCE before registerDependencies() and before app.listen().
 * If any required variable is missing or invalid, logs a clear error
 * and exits with code 1 immediately - never starts accepting traffic
 * with a broken config.
 *
 * Why fail fast?
 *   A missing JWT_SECRET discovered at login time (not startup) means
 *   the app ran for an unknown period in a broken state.
 *   A missing DATABASE_HOST discovered on first request means the health check
 *   passed but real queries fail. Fail at startup - always.
 *
 * Usage:
 *   import { validateEnv } from "config/validateEnv.js";
 *   validateEnv(); // call before registerDependencies()
 */

import path from "path";
import dotenv from "dotenv";

// Load the .env file matching the current NODE_ENV (e.g. .env.development)
const env = process.env.NODE_ENV || "development";
const envFile = path.resolve(process.cwd(), `.env.${env}`);
dotenv.config({ path: envFile });

interface EnvVar {
    key: string;
    required: boolean;
    validate?: (value: string) => string | null; // return error message or null if ok
}

const ENV_SPEC: EnvVar[] = [
    //  Database 
    {
        key: "DATABASE_HOST",
        required: true,
    },
    {
        key: "DATABASE_PORT",
        required: false,
        validate: (v) => {
            const n = Number(v);
            return isNaN(n) || n < 1 || n > 65535
                ? "DATABASE_PORT must be a valid port number (1-65535)"
                : null;
        },
    },
    {
        key: "DATABASE_NAME",
        required: true,
    },
    {
        key: "DATABASE_USER",
        required: true,
    },
    {
        key: "DATABASE_PASSWORD",
        required: true,
    },

    //  Auth 
    {
        key: "JWT_SECRET",
        required: true,
        validate: (v) =>
            v.length < 32
                ? "JWT_SECRET must be at least 32 characters for security"
                : null,
    },
    {
        key: "JWT_EXPIRES_IN",
        required: false,
        validate: (v) =>
            /^\d+[smhd]$/.test(v) || /^\d+$/.test(v)
                ? null
                : "JWT_EXPIRES_IN must be a duration like '7d', '24h', '3600s', or seconds as a number",
    },

    //  Server 
    {
        key: "PORT",
        required: false,
        validate: (v) => {
            const n = Number(v);
            return isNaN(n) || n < 1 || n > 65535
                ? "PORT must be a valid port number (1-65535)"
                : null;
        },
    },
    {
        key: "NODE_ENV",
        required: false,
        validate: (v) =>
            ["development", "production", "test"].includes(v)
                ? null
                : "NODE_ENV must be one of: development, production, test",
    },

    //  Redis 
    {
        key: "REDIS_HOST",
        required: true,
    },
    {
        key: "REDIS_PORT",
        required: false,
        validate: (v) => isNaN(Number(v)) ? "REDIS_PORT must be a number" : null,
    },
];

/**
 * Validates all environment variables against ENV_SPEC.
 * Collects ALL errors before printing - never stops at the first one.
 * Calls process.exit(1) if any required var is missing or any validation fails.
 */
export function validateEnv(): void {
    const errors: string[] = [];

    for (const spec of ENV_SPEC) {
        const value = process.env[spec.key];

        // Missing required variable
        if (value === undefined || value.trim() === "") {
            if (spec.required) {
                errors.push(`${spec.key} is required but not set`);
            }
            // Optional + missing = skip validation, that's fine
            continue;
        }

        // Run custom validator if provided
        if (spec.validate) {
            const errorMessage = spec.validate(value);
            if (errorMessage) {
                errors.push(`  ✗ ${spec.key}: ${errorMessage}`);
            }
        }
    }

    if (errors.length > 0) {
        console.error(
            "\nEnvironment validation failed - server will not start:\n",
        );
        errors.forEach((e) => console.error(e));
        console.error(
            "\nFix the above variables in your .env file and restart.\n",
        );
        process.exit(1);
    }

    console.log("Environment variables validated");
}

export const ENV = {
    DATABASE_HOST: process.env.DATABASE_HOST!,
    DATABASE_PORT: process.env.DATABASE_PORT
        ? Number(process.env.DATABASE_PORT)
        : 5432,
    DATABASE_NAME: process.env.DATABASE_NAME!,
    DATABASE_USER: process.env.DATABASE_USER!,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD!,
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
    PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
    NODE_ENV: process.env.NODE_ENV || "development",
    REDIS_HOST: process.env.REDIS_HOST!,
    REDIS_PORT: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
}