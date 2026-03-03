/**
 * @module user/enum
 * @description Enumerations for the user module.
 */

/**
 * Role assigned to a user account.
 *
 * - `CUSTOMER`  standard end-user; can browse products, create orders.
 * - `ADMIN`     elevated privileges; can manage products, view audit logs.
 */
export enum UserRole {
    CUSTOMER = "customer",
    ADMIN = "admin",
}