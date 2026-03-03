import type { Knex } from "knex";

//  Migration: Audit trigger 
// One trigger FUNCTION shared across all tables.
// Attached as AFTER INSERT/UPDATE/DELETE on each audited table.
//
// Context is read from PostgreSQL session variables set via SET LOCAL.
// These are set by withAuditContext() in the application layer before
// any queries run inside a transaction.
//
// If variables are not set (direct DB access / migrations / cron):
//   performed_by -> NULL
//   ip_address   -> NULL
//   user_agent   -> NULL
//   source       -> 'admin_db'
//
// SET LOCAL scope:
//   Variables set with SET LOCAL are scoped to the current transaction.
//   They are automatically cleared on COMMIT or ROLLBACK.
//   This means each transaction has its own isolated context - no leakage
//   between concurrent requests.

export async function up(knex: Knex): Promise<void> {
    //  Trigger Function 
    await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_log_trigger()
    RETURNS TRIGGER AS $$
    DECLARE
      v_user_id     INTEGER;
      v_ip          TEXT;
      v_user_agent  TEXT;
      v_source      TEXT;
      v_action      TEXT;
      v_entity_id   INTEGER;
      v_old_data    JSONB;
      v_new_data    JSONB;
    BEGIN

      --  Read session variables set by withAuditContext() 
      -- current_setting(name, missing_ok):
      --   missing_ok = true -> returns '' instead of throwing if not set
      --   We treat empty string as NULL (not set = direct DB access)

      v_ip         := NULLIF(current_setting('app.current_ip',         true), '');
      v_user_agent := NULLIF(current_setting('app.current_user_agent', true), '');
      v_source     := NULLIF(current_setting('app.current_source',     true), '');

      -- Parse user_id as integer - empty string or non-numeric -> NULL
      BEGIN
        v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;
      EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
      END;

      --  Determine source 
      -- If app.current_source was never set, this change bypassed the app.
      -- Mark it as 'admin_db' so it's clearly distinguishable in audit trail.
      IF v_source IS NULL THEN
        v_source := 'admin_db';
      END IF;

      --  Map trigger operation to audit action 
      v_action := TG_OP;  -- 'INSERT', 'UPDATE', 'DELETE'

      --  Extract entity id and row snapshots 
      IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id;
        v_old_data  := to_jsonb(OLD);
        v_new_data  := NULL;
      ELSIF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id;
        v_old_data  := NULL;
        v_new_data  := to_jsonb(NEW);
      ELSE  -- UPDATE
        v_entity_id := NEW.id;
        v_old_data  := to_jsonb(OLD);
        v_new_data  := to_jsonb(NEW);
      END IF;

      --  Write audit log entry 
      -- This INSERT is part of the same transaction as the triggering operation.
      -- If the transaction rolls back, this log entry rolls back too.
      -- Consistency between data changes and audit trail is guaranteed.
      INSERT INTO audit_logs (
        entity_type,
        entity_id,
        action,
        old_data,
        new_data,
        performed_by,
        ip_address,
        user_agent,
        source,
        created_at
      ) VALUES (
        TG_TABLE_NAME,    -- automatically set to the table that fired the trigger
        v_entity_id,
        v_action,
        v_old_data,
        v_new_data,
        v_user_id,
        v_ip,
        v_user_agent,
        v_source,
        NOW()
      );

      -- AFTER triggers must return NULL (row already written, nothing to modify)
      RETURN NULL;

    END;
    $$ LANGUAGE plpgsql
    SECURITY DEFINER  -- runs with the privileges of the function owner, not caller
  `);

    //  Attach trigger to all audited tables 
    // We audit every table that holds business-critical data.
    // audit_logs itself is NOT audited - that would cause infinite recursion.
    // wallet_transactions is NOT audited - it IS the audit trail for wallet.

    const auditedTables = [
        "users",
        "products",
        "wallet",
        "orders",
        "order_items",
    ];

    for (const table of auditedTables) {
        await knex.raw(`
      CREATE TRIGGER audit_${table}
      AFTER INSERT OR UPDATE OR DELETE
      ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION audit_log_trigger()
    `);
    }
}

export async function down(knex: Knex): Promise<void> {
    const auditedTables = [
        "users",
        "products",
        "wallet",
        "orders",
        "order_items",
    ];

    for (const table of auditedTables) {
        await knex.raw(`DROP TRIGGER IF EXISTS audit_${table} ON ${table}`);
    }

    await knex.raw(`DROP FUNCTION IF EXISTS audit_log_trigger()`);
}
