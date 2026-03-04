/**
 * @module schemas/user.schemas
 * @description Zod validation schemas for user-related HTTP requests.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /api/v1/users/register
// ---------------------------------------------------------------------------
export const registerSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    email: z.string().email("Invalid email address").max(255),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128),
    role: z.enum(["customer", "admin"]).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/users/login
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/users/:id
// ---------------------------------------------------------------------------
export const updateUserSchema = z
    .object({
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().max(255).optional(),
        password: z.string().min(8).max(128).optional(),
        role: z.enum(["customer", "admin"]).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided",
    });

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
