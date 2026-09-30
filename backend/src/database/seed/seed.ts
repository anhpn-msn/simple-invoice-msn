import { hash } from 'bcryptjs';
import { count, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { SystemClock, toBusinessDate } from '../../common/clock';
import { uuidv7 } from '../../common/ids/uuidv7';
import { EnvValidationError } from '../../config/env';
import { loadEnvFile } from '../../config/load-env-file';
import {
  INVOICE_STATUSES,
  PERSISTED_STATUSES,
  deriveEffectiveStatus,
  type PersistedInvoiceStatus,
} from '../../invoices/domain';
import * as schema from '../schema';
import { buildAppendixInvoice } from './appendix-a';
import { generateInvoices } from './generate-invoices';
import { parseSeedEnv } from './seed-env';
import {
  AUDITOR_EMAIL,
  AUDITOR_FULLNAME,
  DEMO_EMAIL,
  DEMO_FULLNAME,
  DEMO_USER_ID,
  SEED_POOL_SIZE,
} from './seed.constants';
import type { RunSeedOptions, SeedConfig, SeedResult } from './seed.types';

/**
 * Seeds demo users, the Appendix A invoice and 40 generated invoices in one
 * transaction. Safe to run repeatedly: existing rows are left untouched.
 * Passwords are hashed here and never logged or returned.
 */
export async function runSeed(options: RunSeedOptions): Promise<SeedResult> {
  const clock = options.clock ?? new SystemClock();
  const businessDate = toBusinessDate(clock.now(), options.businessTimezone);

  const seeded = [
    buildAppendixInvoice(),
    ...generateInvoices(businessDate, DEMO_USER_ID),
  ];
  const [demoHash, auditorHash] = await Promise.all([
    hash(options.demoPassword, options.bcryptCost),
    hash(options.demoPassword, options.bcryptCost),
  ]);

  const seedUsers = [
    {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      passwordHash: demoHash,
      fullname: DEMO_FULLNAME,
      role: 'ACCOUNTANT',
    },
    {
      id: uuidv7(),
      email: AUDITOR_EMAIL,
      passwordHash: auditorHash,
      fullname: AUDITOR_FULLNAME,
      role: 'AUDITOR',
    },
  ];

  const pool = new Pool({
    connectionString: options.databaseUrl,
    max: SEED_POOL_SIZE,
  });
  const db = drizzle(pool, { schema });
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(
          inArray(
            schema.users.email,
            seedUsers.map((u) => u.email),
          ),
        );
      const existingEmails = new Set(existing.map((row) => row.email));

      for (const user of seedUsers) {
        const insert = tx.insert(schema.users).values(user);
        if (options.resetPasswords) {
          await insert.onConflictDoUpdate({
            target: schema.users.email,
            set: {
              passwordHash: user.passwordHash,
              failedLoginCount: 0,
              lockedUntil: null,
              updatedAt: new Date(),
            },
          });
        } else {
          await insert.onConflictDoNothing();
        }
      }

      // Invoices reference the demo user by its fixed id (Appendix A). If the
      // email was taken by a user with another id, fail here with a clear
      // message instead of a foreign key error later.
      const demoRows = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, DEMO_EMAIL));
      if (demoRows.length !== 1 || demoRows[0].id !== DEMO_USER_ID) {
        throw new Error(
          `User ${DEMO_EMAIL} exists with an id other than the Appendix A id ${DEMO_USER_ID}`,
        );
      }

      const inserted = await tx
        .insert(schema.invoices)
        .values(seeded.map((s) => s.invoice))
        .onConflictDoNothing()
        .returning({ id: schema.invoices.id });
      const insertedIds = new Set(inserted.map((row) => row.id));

      // Items only for invoices this run created, so a skipped invoice never gets a second item.
      const newItems = seeded.filter((s) => insertedIds.has(s.invoice.id));
      if (newItems.length > 0) {
        await tx
          .insert(schema.invoiceItems)
          .values(newItems.map((s) => s.item))
          .onConflictDoNothing();
      }

      const dueRows = await tx
        .select({
          status: schema.invoices.status,
          dueDate: schema.invoices.dueDate,
          total: count(),
        })
        .from(schema.invoices)
        .groupBy(schema.invoices.status, schema.invoices.dueDate);

      const persisted = zeroCounts(PERSISTED_STATUSES);
      const effective = zeroCounts(INVOICE_STATUSES);
      for (const row of dueRows) {
        const status = row.status as PersistedInvoiceStatus;
        persisted[status] += row.total;
        effective[deriveEffectiveStatus(status, row.dueDate, businessDate)] +=
          row.total;
      }

      return {
        businessDate,
        usersCreated: seedUsers.filter((u) => !existingEmails.has(u.email))
          .length,
        passwordsReset: options.resetPasswords ? existingEmails.size : 0,
        invoicesInserted: inserted.length,
        invoicesSkipped: seeded.length - inserted.length,
        persisted,
        effective,
      };
    });
  } finally {
    await pool.end();
  }
}

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

/**
 * Drizzle wraps driver errors in a message that lists the bound parameters,
 * which for a user insert include the password hash. Print the driver's own
 * message instead.
 */
export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const source = error.cause instanceof Error ? error.cause : error;
  return source.message.split('\n')[0];
}

async function main(): Promise<void> {
  loadEnvFile();
  let config: SeedConfig;
  try {
    config = parseSeedEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const result = await runSeed(config);
  console.log(`Seed complete (business date ${result.businessDate})`);
  console.log(
    `  users created: ${result.usersCreated}, passwords reset: ${result.passwordsReset}`,
  );
  console.log(
    `  invoices inserted: ${result.invoicesInserted}, already present: ${result.invoicesSkipped}`,
  );
  console.log(`  persisted status: ${formatCounts(result.persisted)}`);
  console.log(`  effective status: ${formatCounts(result.effective)}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Seed failed:', safeErrorMessage(error));
    process.exit(1);
  });
}
