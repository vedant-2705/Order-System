import type { Knex } from "knex";

//  Migration: order_number auto-generation trigger 
// Generates order numbers in format: ORD-YYYYMMDD-XXXXX
// e.g. ORD-20240115-00001, ORD-20240115-00042
//
// WHY a trigger instead of application code?
// - Application generates order_number -> race condition between two concurrent
//   inserts could generate the same number (both read same max, both +1).
// - DB trigger runs atomically inside the transaction - guaranteed unique.
// - Sequence resets daily - gives clean per-day numbering.
//
// Implementation:
// - PostgreSQL sequence for the daily counter (resets at midnight via cronjob
//   or we use date-prefixed approach with LPAD)
// - Trigger fires BEFORE INSERT, sets order_number if not provided.

export async function up(knex: Knex): Promise<void> {
    //  Sequence for order number counter 
    // This sequence increments forever - the date prefix provides daily context.
    // For true daily reset, a scheduled job would call:
    //   ALTER SEQUENCE order_number_seq RESTART WITH 1
    // at midnight. For this project we use the simpler forever-incrementing approach.
    await knex.raw(`
        CREATE SEQUENCE IF NOT EXISTS order_number_seq
        START WITH 1
        INCREMENT BY 1
        NO MAXVALUE
        CACHE 1
    `);

    //  Trigger Function 
    // PL/pgSQL function that generates the order_number.
    // Format: ORD-YYYYMMDD-XXXXX
    //   YYYYMMDD: current date when order is created
    //   XXXXX:    zero-padded sequence number (5 digits, supports 99,999/day)
    //
    // RETURNS NEW: required for BEFORE triggers - modified row is inserted.
    await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_order_number()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Only generate if not already set (allows manual override in tests)
      IF NEW.order_number IS NULL THEN
        NEW.order_number := 'ORD-'
          || TO_CHAR(NOW(), 'YYYYMMDD')
          || '-'
          || LPAD(NEXTVAL('order_number_seq')::TEXT, 5, '0');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

    //  Attach Trigger to orders table 
    // BEFORE INSERT: fires before the row hits the heap -
    //   allows us to SET NEW.order_number before it's stored.
    // FOR EACH ROW: fires once per inserted row (not once per statement).
    await knex.raw(`
    CREATE TRIGGER trigger_generate_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_number()
  `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        `DROP TRIGGER IF EXISTS trigger_generate_order_number ON orders`,
    );
    await knex.raw(`DROP FUNCTION IF EXISTS generate_order_number()`);
    await knex.raw(`DROP SEQUENCE IF EXISTS order_number_seq`);
}
