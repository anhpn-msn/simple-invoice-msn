import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { APP_CREATE_OPTIONS, configureApp } from '../../src/app.setup';
import { DRIZZLE, PG_POOL } from '../../src/database/database.module';
import type { Database } from '../../src/database/database.types';
import { runMigrations } from '../../src/database/migrate';
import type { TestDatabase, TestAppOptions, TestApp } from './test.types';

/**
 * Isolation model: one PostgreSQL 17 container per e2e test FILE (created in
 * beforeAll, removed in afterAll). audit_events is append-only (triggers forbid
 * DELETE and TRUNCATE) and users cannot be truncated while audit rows reference
 * them, so a fresh container per file is the only clean reset. Between tests
 * inside a file call `truncateBusinessTables`, which empties every table except
 * users and audit_events (see below).
 */

/** Starts postgres:17-alpine and applies all migrations. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  return { url, stop: () => container.stop().then(() => undefined) };
}

/** Default env for tests; secrets are random per call, never committed. */
export function defaultTestEnv(databaseUrl: string): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(36).toString('base64url'),
    SEED_DEMO_PASSWORD: randomBytes(18).toString('base64url'),
    LOG_LEVEL: 'silent',
    BCRYPT_COST: '4',
    THROTTLE_GLOBAL_LIMIT: '100000',
    THROTTLE_LOGIN_LIMIT: '100000',
    THROTTLE_REFRESH_LIMIT: '100000',
    SWAGGER_ENABLED: 'true',
  };
}

/**
 * Builds the real AppModule with the production `configureApp` against a
 * Testcontainers PostgreSQL. Call `close()` in afterAll.
 *
 * @example
 * let ctx: TestApp;
 * beforeAll(async () => {
 *   ctx = await createTestApp({
 *     env: { THROTTLE_LOGIN_LIMIT: '3' },
 *     overrideProviders: [{ token: CLOCK, useValue: fixedClock }],
 *   });
 * });
 * afterEach(() => ctx.truncateBusinessTables());
 * afterAll(() => ctx.close());
 * it('works', async () => {
 *   await ctx.http().get('/health').expect(200);
 * });
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const database = options.database ?? (await startTestDatabase());
  const ownedDatabase = options.database ? undefined : database;

  const env = { ...defaultTestEnv(database.url), ...options.env };
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  const restoreEnv = (): void => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  let app: NestExpressApplication;
  try {
    const builder = Test.createTestingModule({ imports: [AppModule] });
    for (const override of options.overrideProviders ?? []) {
      builder.overrideProvider(override.token).useValue(override.useValue);
    }
    const moduleRef = await builder.compile();
    app =
      moduleRef.createNestApplication<NestExpressApplication>(
        APP_CREATE_OPTIONS,
      );
    configureApp(app, { enableShutdownHooks: false });
    await app.init();
  } catch (error) {
    restoreEnv();
    await ownedDatabase?.stop();
    throw error;
  }

  const db = app.get<Database>(DRIZZLE);
  const pool = app.get<Pool>(PG_POOL);

  return {
    app,
    http: () => request(app.getHttpServer()),
    db,
    pool,
    databaseUrl: database.url,
    env,
    truncateBusinessTables: () => truncateBusinessTables(db),
    close: async () => {
      await (app as INestApplication).close();
      restoreEnv();
      await ownedDatabase?.stop();
    },
  };
}

/**
 * Empties invoice_items, invoices, idempotency_keys and refresh_tokens and
 * clears login lockouts. users and audit_events are deliberately kept: audit
 * rows are immutable and reference users, so users cannot be truncated either.
 * Tests should create users with unique emails.
 */
export async function truncateBusinessTables(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE invoice_items, invoices, idempotency_keys, refresh_tokens RESTART IDENTITY`,
  );
  await db.execute(
    sql`UPDATE users SET failed_login_count = 0, locked_until = NULL`,
  );
}
