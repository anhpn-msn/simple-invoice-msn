import { randomUUID } from 'node:crypto';
import { CSRF_HEADERS } from './utils/auth';
import type { TestApp, TestDatabase } from './utils/test.types';
import { createTestApp, startTestDatabase } from './utils/test-app';
import { HTTP_HEADERS } from '../src/common/http/http-headers.constants';

const LOGIN_LIMIT = 3;
const REFRESH_LIMIT = 3;

// Express routes are case-insensitive and ignore a trailing slash, so every
// spelling reaches the same handler and must share the same throttle counter.
const LOGIN_PATHS = [
  '/auth/login',
  '/AUTH/LOGIN',
  '/Auth/Login',
  '/auth/login/',
];
const REFRESH_PATHS = [
  '/auth/refresh',
  '/AUTH/REFRESH',
  '/Auth/Refresh',
  '/auth/refresh/',
];

describe('Auth throttling by handler (e2e)', () => {
  let database: TestDatabase;
  let t: TestApp;
  let clientIp = 0;
  const nextIp = (): string => {
    clientIp += 1;
    return `203.0.113.${clientIp}`;
  };

  beforeAll(async () => {
    database = await startTestDatabase();
    t = await createTestApp({
      database,
      env: {
        THROTTLE_LOGIN_LIMIT: String(LOGIN_LIMIT),
        THROTTLE_REFRESH_LIMIT: String(REFRESH_LIMIT),
      },
    });
  });

  afterAll(async () => {
    await t.close();
    await database.stop();
  });

  const postLogin = (path: string, ip: string) =>
    t
      .http()
      .post(path)
      .set(HTTP_HEADERS.X_FORWARDED_FOR, ip)
      .send({ email: `flood-${randomUUID()}@example.test`, password: 'guess' });

  const postRefresh = (path: string, ip: string) =>
    t.http().post(path).set(CSRF_HEADERS).set(HTTP_HEADERS.X_FORWARDED_FOR, ip);

  describe.each(LOGIN_PATHS)('POST %s', (path) => {
    it('is limited by the login throttler', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i <= LOGIN_LIMIT; i += 1) {
        statuses.push((await postLogin(path, ip)).status);
      }
      expect(statuses).toEqual([401, 401, 401, 429]);
    });
  });

  it('shares one login counter across all spellings of the path', async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (const path of [...LOGIN_PATHS, ...LOGIN_PATHS]) {
      statuses.push((await postLogin(path, ip)).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429, 429, 429, 429]);
  });

  describe.each(REFRESH_PATHS)('POST %s', (path) => {
    it('is limited by the refresh throttler', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i <= REFRESH_LIMIT; i += 1) {
        statuses.push((await postRefresh(path, ip)).status);
      }
      expect(statuses).toEqual([401, 401, 401, 429]);
    });
  });

  it('does not apply the login limit to other routes', async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < LOGIN_LIMIT + 2; i += 1) {
      const res = await t
        .http()
        .get('/auth/me')
        .set(HTTP_HEADERS.X_FORWARDED_FOR, ip);
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
  });
});
