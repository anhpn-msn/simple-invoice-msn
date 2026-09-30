import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import type request from 'supertest';
import type { Role } from '../../src/common/auth/permissions';
import type { Database } from '../../src/database/database.types';

export interface TestDatabase {
  url: string;
  stop(): Promise<void>;
}

export interface ProviderOverride {
  /** Injection token or class to replace, e.g. the Clock token. */
  token: unknown;
  useValue: unknown;
}

export interface TestAppOptions {
  /** Extra or overriding env vars (all values are strings). */
  env?: Record<string, string>;
  overrideProviders?: ProviderOverride[];
  /** Reuse a database started with startTestDatabase (skips container start). */
  database?: TestDatabase;
}

export interface TestApp {
  app: NestExpressApplication;
  /** supertest bound to the app, e.g. `ctx.http().get('/health')`. */
  http(): ReturnType<typeof request>;
  db: Database;
  pool: Pool;
  databaseUrl: string;
  /** The env applied for this app (JWT_SECRET, SEED_DEMO_PASSWORD, ...). */
  env: Record<string, string>;
  truncateBusinessTables(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateUserOptions {
  role: Role;
  email?: string;
  password?: string;
  fullname?: string;
}

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
}

/** The `user` object returned by POST /auth/login (SPEC 6.1). */
export interface LoginUser {
  id: string;
  email: string;
  fullname: string;
  role: Role;
  permissions: string[];
}

export interface LoginResult {
  accessToken: string;
  /** `name=value` of the refresh cookie, ready for a `Cookie` request header. */
  cookie: string;
  user: LoginUser;
}

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

export interface TokenBody {
  accessToken: string;
  user: LoginUser;
}

/** A type alias, not an interface: it is used as a `Record<string, unknown>` row. */
export type AuditRow = {
  action: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
};
