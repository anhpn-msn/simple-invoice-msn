import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { EnvValidationError, parseDatabaseUrl } from '../config/env';
import { loadEnvFile } from '../config/load-env-file';

/** Works from src/database (tsx) and dist/database (container). */
const defaultMigrationsFolder = resolve(__dirname, '../../drizzle');

/** Applies all pending SQL migrations from the `drizzle/` folder. */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = defaultMigrationsFolder,
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  let databaseUrl: string;
  try {
    databaseUrl = parseDatabaseUrl(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  await runMigrations(databaseUrl);
  console.log('Migrations applied');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      'Migration failed:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
