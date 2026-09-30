import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import type { Role } from '../../src/common/auth/permissions';
import { uuidv7 } from '../../src/common/ids/uuidv7';
import { AppConfigService } from '../../src/config/app-config.service';
import { users } from '../../src/database/schema';
import type { TestApp } from './test.types';
import type {
  CreateUserOptions,
  CreatedUser,
  LoginUser,
  LoginResult,
} from './test.types';
import {
  HTTP_HEADERS,
  headerKey,
} from '../../src/common/http/http-headers.constants';
import { CSRF_HEADER_VALUE } from '../../src/auth/auth.constants';

/** Headers the cookie endpoints (/auth/refresh, /auth/logout) require. */
export const CSRF_HEADERS: Readonly<Record<string, string>> = {
  [HTTP_HEADERS.REQUESTED_WITH]: CSRF_HEADER_VALUE,
};

/**
 * Inserts a user directly (there is no registration endpoint). Emails are
 * unique per call because users can never be deleted between tests. The
 * password is random per run, never a committed value.
 */
export async function createUser(
  t: TestApp,
  options: CreateUserOptions,
): Promise<CreatedUser> {
  const id = uuidv7();
  const email = (
    options.email ??
    `${options.role.toLowerCase()}-${randomUUID()}@example.test`
  ).toLowerCase();
  const password = options.password ?? randomBytes(18).toString('base64url');
  const cost = t.app.get(AppConfigService).get('bcryptCost');
  await t.db.insert(users).values({
    id,
    email,
    passwordHash: await hash(password, cost),
    fullname: options.fullname ?? `Test ${options.role.toLowerCase()}`,
    role: options.role,
  });
  return { id, email, password };
}

/** Reads the refresh cookie pair from a response's Set-Cookie headers. */
export function extractRefreshCookie(
  t: TestApp,
  setCookie: string | string[] | undefined,
): string | undefined {
  const name = t.app.get(AppConfigService).get('refreshCookieName');
  const headers = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const match = headers.find((h) => h.startsWith(`${name}=`));
  return match?.split(';')[0];
}

/** Logs in through the real endpoint with explicit credentials. */
export async function login(
  t: TestApp,
  credentials: { email: string; password: string },
): Promise<LoginResult> {
  // Only these two fields: the endpoint rejects unknown properties.
  const res = await t
    .http()
    .post('/auth/login')
    .send({ email: credentials.email, password: credentials.password });
  if (res.status !== 200) {
    throw new Error(`login failed with status ${res.status}`);
  }
  const cookie = extractRefreshCookie(
    t,
    res.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
  );
  if (!cookie) throw new Error('login response did not set the refresh cookie');
  const body = res.body as { accessToken: string; user: LoginUser };
  return { accessToken: body.accessToken, cookie, user: body.user };
}

/** Creates a fresh user with the given role and logs it in. */
export async function loginAs(t: TestApp, role: Role): Promise<LoginResult> {
  const { email, password } = await createUser(t, { role });
  return login(t, { email, password });
}
