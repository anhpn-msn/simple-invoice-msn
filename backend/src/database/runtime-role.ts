import { Client } from 'pg';
import { EnvValidationError } from '../config/env';
import { loadEnvFile } from '../config/load-env-file';
import { parseRuntimeRoleEnv } from './runtime-role-env';
import { scramSha256Verifier } from './runtime-role-password';
import type { RuntimeRoleTableGrant } from './runtime-role.types';

/*
 * DDL cannot take bound parameters, so the role name and the password
 * verifier travel as bound parameters into transaction-local settings, and
 * this block quotes them on the server with format('%I') and format('%L').
 * No SQL text is ever built from a value on the client.
 *
 * Grants follow what the code actually runs: UPDATE only where the app updates
 * (login counters, token rotation, idempotency replay), never DELETE,
 * TRUNCATE, REFERENCES or TRIGGER, and nothing on the drizzle migrations
 * schema. The audit_events identity column needs no sequence privilege.
 * Everything else the role might hold is revoked first, so every run ends in
 * exactly this state.
 */
const APPLY_RUNTIME_ROLE_SQL = `
DO $runtime_role$
DECLARE
  app_role constant text := current_setting('simple_invoice.runtime_role');
  app_verifier constant text := current_setting('simple_invoice.runtime_role_verifier');
  app_oid oid;
  item record;
BEGIN
  IF app_role IN (current_user, session_user) THEN
    RAISE EXCEPTION 'the runtime role must not be the migration role';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('CREATE ROLE %I', app_role);
  END IF;
  SELECT oid INTO STRICT app_oid FROM pg_roles WHERE rolname = app_role;

  EXECUTE format(
    'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
    app_role, app_verifier);

  -- An owner can disable the audit triggers or drop the CHECK constraints.
  IF EXISTS (SELECT FROM pg_class WHERE relowner = app_oid)
     OR EXISTS (SELECT FROM pg_namespace WHERE nspowner = app_oid)
     OR EXISTS (SELECT FROM pg_proc WHERE proowner = app_oid)
     OR EXISTS (SELECT FROM pg_database WHERE datdba = app_oid) THEN
    RAISE EXCEPTION 'role % owns database objects, a runtime role must own nothing', app_role;
  END IF;

  -- NOINHERIT alone still allows SET ROLE to any role it is a member of.
  FOR item IN
    SELECT roleid::regrole AS granted, grantor::regrole AS grantor
    FROM pg_auth_members WHERE member = app_oid
  LOOP
    EXECUTE format('REVOKE %s FROM %I GRANTED BY %s', item.granted, app_role, item.grantor);
  END LOOP;

  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM %I', current_database(), app_role);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app_role);

  FOR item IN
    SELECT nspname FROM pg_namespace
    WHERE nspname <> 'information_schema' AND nspname NOT LIKE 'pg\\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', item.nspname, app_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', item.nspname, app_role);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', item.nspname, app_role);
    EXECUTE format('REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM %I', item.nspname, app_role);
  END LOOP;
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;

  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE ON TABLE public.users, public.refresh_tokens, public.idempotency_keys TO %I',
    app_role);
  EXECUTE format(
    'GRANT SELECT, INSERT ON TABLE public.invoices, public.invoice_items, public.audit_events TO %I',
    app_role);
END
$runtime_role$`;

const TABLE_PRIVILEGES_SQL = `
SELECT c.relname AS "table",
       ARRAY(
         SELECT p FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p
         WHERE has_table_privilege($1, c.oid, p)
       ) AS privileges
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname`;

/**
 * Creates or updates the least-privilege login role the API connects with and
 * sets its grants. Idempotent. Must run as the schema owner, after migrations.
 * Returns the role's effective table privileges in `public`.
 */
export async function applyRuntimeRole(
  ownerDatabaseUrl: string,
  roleName: string,
  password: string,
): Promise<RuntimeRoleTableGrant[]> {
  const client = new Client({ connectionString: ownerDatabaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('simple_invoice.runtime_role', $1, true),
              set_config('simple_invoice.runtime_role_verifier', $2, true)`,
      [roleName, scramSha256Verifier(password)],
    );
    await client.query(APPLY_RUNTIME_ROLE_SQL);
    const grants = await client.query<RuntimeRoleTableGrant>(
      TABLE_PRIVILEGES_SQL,
      [roleName],
    );
    await client.query('COMMIT');
    return grants.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseRuntimeRoleEnv(process.env);
  if (config === undefined) {
    console.log('Runtime role: APP_DB_USER not set, skipped');
    return;
  }
  const grants = await applyRuntimeRole(
    config.ownerDatabaseUrl,
    config.roleName,
    config.password,
  );
  console.log(`Runtime role ${config.roleName} ready`);
  for (const grant of grants) {
    const privileges =
      grant.privileges.length > 0 ? grant.privileges.join(', ') : 'none';
    console.log(`  ${grant.table}: ${privileges}`);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
    } else {
      console.error(
        'Runtime role setup failed:',
        error instanceof Error ? error.message : error,
      );
    }
    process.exit(1);
  });
}
