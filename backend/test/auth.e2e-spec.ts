import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { CLOCK, FixedClock } from '../src/common/clock';
import { AppConfigService } from '../src/config/app-config.service';
import {
  CSRF_HEADERS,
  createUser,
  extractRefreshCookie,
  login,
  loginAs,
} from './utils/auth';
import type {
  AuditRow,
  CreatedUser,
  ErrorBody,
  LoginUser,
  TestApp,
  TestDatabase,
  TokenBody,
} from './utils/test.types';
import { createTestApp, startTestDatabase } from './utils/test-app';
import {
  CACHE_CONTROL_NO_STORE,
  HTTP_HEADERS,
  headerKey,
} from '../src/common/http/http-headers.constants';
import { BEARER_SCHEME } from '../src/auth/auth.constants';
import { MS_PER_SECOND } from '../src/common/clock/clock.constants';
import { sha256Hex } from '../src/common/crypto/sha256';
import { bodyOf } from './utils/http';

const ORIGIN = 'http://localhost:8080';

describe('Auth (e2e)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(() => database.stop());

  describe('flows', () => {
    let t: TestApp;
    let clock: FixedClock;
    let config: AppConfigService;

    const advance = (seconds: number): void =>
      clock.set(new Date(clock.now().getTime() + seconds * MS_PER_SECOND));

    const me = (accessToken?: string) => {
      const req = t.http().get('/auth/me');
      return accessToken
        ? req.set(HTTP_HEADERS.AUTHORIZATION, `${BEARER_SCHEME} ${accessToken}`)
        : req;
    };

    const refresh = (
      cookie?: string,
      headers: Record<string, string> = CSRF_HEADERS,
    ) => {
      const req = t.http().post('/auth/refresh').set(headers);
      return cookie ? req.set(HTTP_HEADERS.COOKIE, cookie) : req;
    };

    const logout = (
      cookie?: string,
      headers: Record<string, string> = CSRF_HEADERS,
    ) => {
      const req = t.http().post('/auth/logout').set(headers);
      return cookie ? req.set(HTTP_HEADERS.COOKIE, cookie) : req;
    };

    const auditRows = async (
      action: string,
      actor?: string,
    ): Promise<AuditRow[]> => {
      const result = await t.db.execute<AuditRow>(
        actor
          ? sql`SELECT action, actor_user_id, metadata FROM audit_events WHERE action = ${action} AND actor_user_id = ${actor} ORDER BY id`
          : sql`SELECT action, actor_user_id, metadata FROM audit_events WHERE action = ${action} ORDER BY id`,
      );
      return result.rows;
    };

    beforeAll(async () => {
      clock = new FixedClock(new Date());
      t = await createTestApp({
        database,
        env: { ALLOWED_ORIGINS: ORIGIN },
        overrideProviders: [{ token: CLOCK, useValue: clock }],
      });
      config = t.app.get(AppConfigService);
    });

    afterEach(async () => {
      clock.set(new Date());
      await t.truncateBusinessTables();
    });

    afterAll(() => t.close());

    describe('POST /auth/login', () => {
      it('returns the SPEC 6.1 body and a hardened refresh cookie', async () => {
        const user = await createUser(t, {
          role: 'ACCOUNTANT',
          fullname: 'Ada Accountant',
        });
        const res = await t
          .http()
          .post('/auth/login')
          .send({ email: user.email, password: user.password })
          .expect(200);

        expect(res.headers[headerKey(HTTP_HEADERS.CACHE_CONTROL)]).toBe(
          CACHE_CONTROL_NO_STORE,
        );
        expect(res.body).toEqual({
          accessToken: expect.any(String) as unknown,
          tokenType: BEARER_SCHEME,
          expiresIn: config.get('jwtAccessTtlSeconds'),
          user: {
            id: user.id,
            email: user.email,
            fullname: 'Ada Accountant',
            role: 'ACCOUNTANT',
            permissions: ['invoice:read', 'invoice:create'],
          },
        });

        const setCookie = (
          res.headers[headerKey(HTTP_HEADERS.SET_COOKIE)] as unknown as string[]
        ).find((c) => c.startsWith(`${config.get('refreshCookieName')}=`));
        expect(setCookie).toBeDefined();
        const attributes = (setCookie ?? '').split('; ');
        expect(attributes).toEqual(
          expect.arrayContaining([
            `Max-Age=${config.get('refreshTokenTtlSeconds')}`,
            `Path=${config.get('refreshCookiePath')}`,
            'HttpOnly',
            'Secure',
            'SameSite=Strict',
          ]),
        );

        const raw = (
          extractRefreshCookie(
            t,
            res.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
          ) ?? ''
        ).split('=')[1];
        expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const stored = await t.db.execute<{ token_hash: string }>(
          sql`SELECT token_hash FROM refresh_tokens WHERE user_id = ${user.id}`,
        );
        expect(stored.rows).toEqual([{ token_hash: sha256Hex(raw) }]);
      });

      it('accepts the email in any case and with surrounding spaces', async () => {
        const user = await createUser(t, { role: 'AUDITOR' });
        await t
          .http()
          .post('/auth/login')
          .send({
            email: `  ${user.email.toUpperCase()} `,
            password: user.password,
          })
          .expect(200);
      });

      it('answers a wrong password exactly like an unknown email', async () => {
        const user = await createUser(t, { role: 'ACCOUNTANT' });
        const wrong = await t
          .http()
          .post('/auth/login')
          .send({ email: user.email, password: 'not-the-password' })
          .expect(401);
        const unknown = await t
          .http()
          .post('/auth/login')
          .send({
            email: `nobody-${randomUUID()}@example.test`,
            password: 'whatever',
          })
          .expect(401);
        const expected = {
          statusCode: 401,
          message: 'Invalid email or password',
          error: 'Unauthorized',
        };
        expect(wrong.body).toEqual(expected);
        expect(unknown.body).toEqual(expected);
        expect(
          wrong.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
        ).toBeUndefined();
      });

      it('audits failures with an email hash and never the raw email or password', async () => {
        const email = `ghost-${randomUUID()}@example.test`;
        const password = `pw-${randomUUID()}`;
        await t
          .http()
          .post('/auth/login')
          .send({ email, password })
          .expect(401);
        const rows = await auditRows('LOGIN_FAILED');
        const row = rows.find((r) => r.metadata.emailHash === sha256Hex(email));
        expect(row).toMatchObject({
          actor_user_id: null,
          metadata: { reason: 'UNKNOWN_USER', emailHash: sha256Hex(email) },
        });
        const everything = JSON.stringify(rows);
        expect(everything).not.toContain(email);
        expect(everything).not.toContain(password);
      });

      it('returns the standard 400 shape for invalid input', async () => {
        const res = await t
          .http()
          .post('/auth/login')
          .send({ email: 'not-an-email', password: '', extra: true })
          .expect(400);
        expect(res.body).toEqual({
          statusCode: 400,
          message: expect.arrayContaining([expect.any(String)]) as unknown,
          error: 'Bad Request',
        });
        const long = await t
          .http()
          .post('/auth/login')
          .send({ email: 'a@example.test', password: 'a'.repeat(73) })
          .expect(400);
        expect(bodyOf<ErrorBody>(long).message).toEqual([
          'password must be at most 72 bytes',
        ]);
      });

      it('locks the account after 5 failures, even for the right password, then unlocks', async () => {
        const user = await createUser(t, { role: 'ACCOUNTANT' });
        const attempt = (password: string) =>
          t.http().post('/auth/login').send({ email: user.email, password });

        for (let i = 0; i < 5; i += 1) await attempt('wrong').expect(401);
        const locked = await attempt(user.password).expect(401);
        expect(bodyOf<ErrorBody>(locked).message).toBe(
          'Invalid email or password',
        );

        const lockEvents = await auditRows('ACCOUNT_LOCKED', user.id);
        expect(lockEvents).toHaveLength(1);
        expect(lockEvents[0].metadata).toMatchObject({ failedAttempts: 5 });
        const failures = await auditRows('LOGIN_FAILED', user.id);
        expect(failures.map((r) => r.metadata.reason)).toEqual([
          'BAD_PASSWORD',
          'BAD_PASSWORD',
          'BAD_PASSWORD',
          'BAD_PASSWORD',
          'BAD_PASSWORD',
          'LOCKED',
        ]);

        advance(31);
        await attempt(user.password).expect(200);
        const state = await t.db.execute<{
          failed_login_count: number;
          locked_until: Date | null;
        }>(
          sql`SELECT failed_login_count, locked_until FROM users WHERE id = ${user.id}`,
        );
        expect(state.rows[0]).toEqual({
          failed_login_count: 0,
          locked_until: null,
        });
      });

      it('cannot be bypassed by a parallel burst of guesses', async () => {
        const user = await createUser(t, { role: 'ACCOUNTANT' });
        const burst = await Promise.all(
          Array.from({ length: 12 }, () =>
            t
              .http()
              .post('/auth/login')
              .send({ email: user.email, password: 'wrong' }),
          ),
        );
        expect(burst.every((r) => r.status === 401)).toBe(true);
        const checked = (await auditRows('LOGIN_FAILED', user.id)).filter(
          (r) => r.metadata.reason === 'BAD_PASSWORD',
        );
        expect(checked).toHaveLength(5);
      });
    });

    describe('GET /auth/me', () => {
      it('answers 401 with WWW-Authenticate without a valid token', async () => {
        const missing = await me().expect(401);
        expect(missing.headers[headerKey(HTTP_HEADERS.WWW_AUTHENTICATE)]).toBe(
          BEARER_SCHEME,
        );
        expect(missing.body).toEqual({
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
        });
        await me('a.b.c').expect(401);
        await t
          .http()
          .get('/auth/me')
          .set(HTTP_HEADERS.AUTHORIZATION, 'Basic abc')
          .expect(401);
      });

      it('returns the signed-in user', async () => {
        const session = await loginAs(t, 'AUDITOR');
        const res = await me(session.accessToken).expect(200);
        expect(res.body).toEqual(session.user);
        expect(bodyOf<LoginUser>(res).permissions).toEqual(['invoice:read']);
      });

      it('rejects the token once it expires on the business clock', async () => {
        const session = await loginAs(t, 'AUDITOR');
        advance(config.get('jwtAccessTtlSeconds') + 1);
        await me(session.accessToken).expect(401);
      });
    });

    describe('POST /auth/refresh', () => {
      it('rotates the cookie and returns a working access token', async () => {
        const session = await loginAs(t, 'ACCOUNTANT');
        advance(5);
        const res = await refresh(session.cookie)
          .set(HTTP_HEADERS.ORIGIN, ORIGIN)
          .expect(200);
        const next = extractRefreshCookie(
          t,
          res.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
        );
        expect(next).toBeDefined();
        expect(next).not.toBe(session.cookie);
        expect(bodyOf<TokenBody>(res).user).toEqual(session.user);
        expect(res.headers[headerKey(HTTP_HEADERS.CACHE_CONTROL)]).toBe(
          CACHE_CONTROL_NO_STORE,
        );
        await me(bodyOf<TokenBody>(res).accessToken).expect(200);
        expect(
          await auditRows('TOKEN_REFRESHED', session.user.id),
        ).toHaveLength(1);
      });

      it('treats a replayed cookie as theft and kills the whole session', async () => {
        const session = await loginAs(t, 'ACCOUNTANT');
        const rotated = await refresh(session.cookie).expect(200);
        const next =
          extractRefreshCookie(
            t,
            rotated.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
          ) ?? '';
        const nextAccess = bodyOf<TokenBody>(rotated).accessToken;

        const replay = await refresh(session.cookie).expect(401);
        const cleared = extractRefreshCookie(
          t,
          replay.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
        );
        expect(cleared).toBe(`${config.get('refreshCookieName')}=`);

        await refresh(next).expect(401);
        await me(nextAccess).expect(401);
        await me(session.accessToken).expect(401);
        expect(
          await auditRows('REFRESH_TOKEN_REUSE_DETECTED', session.user.id),
        ).not.toHaveLength(0);
      });

      it('answers 401 without a cookie or with a forged one', async () => {
        await refresh().expect(401);
        await refresh(
          `${config.get('refreshCookieName')}=${'A'.repeat(43)}`,
        ).expect(401);
        await refresh(`${config.get('refreshCookieName')}=j:{"a":1}`).expect(
          401,
        );
      });

      it.each<[string, Record<string, string>]>([
        ['the custom header is missing', {}],
        [
          'the Origin is foreign',
          { ...CSRF_HEADERS, [HTTP_HEADERS.ORIGIN]: 'https://evil.example' },
        ],
        [
          'the request is cross-site',
          { ...CSRF_HEADERS, [HTTP_HEADERS.SEC_FETCH_SITE]: 'cross-site' },
        ],
      ])(
        'answers 403 when %s and leaves the session intact',
        async (_name, headers) => {
          const session = await loginAs(t, 'ACCOUNTANT');
          const res = await refresh(session.cookie, headers).expect(403);
          expect(res.body).toEqual({
            statusCode: 403,
            message: 'Forbidden resource',
            error: 'Forbidden',
          });
          await refresh(session.cookie).expect(200);
        },
      );

      it('never extends the session beyond the family lifetime', async () => {
        const session = await loginAs(t, 'AUDITOR');
        const step = Math.floor(config.get('refreshTokenTtlSeconds') / 2);
        let cookie = session.cookie;
        let elapsed = 0;
        while (elapsed + step < config.get('refreshFamilyTtlSeconds')) {
          advance(step);
          elapsed += step;
          const res = await refresh(cookie).expect(200);
          cookie =
            extractRefreshCookie(
              t,
              res.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
            ) ?? '';
        }
        advance(step);
        await refresh(cookie).expect(401);
      });
    });

    describe('POST /auth/logout', () => {
      it('revokes the session immediately, clears the cookie and is idempotent', async () => {
        const session = await loginAs(t, 'ACCOUNTANT');
        await me(session.accessToken).expect(200);

        const res = await logout(session.cookie).expect(204);
        expect(
          extractRefreshCookie(
            t,
            res.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
          ),
        ).toBe(`${config.get('refreshCookieName')}=`);
        await me(session.accessToken).expect(401);
        await refresh(session.cookie).expect(401);

        await logout(session.cookie).expect(204);
        await logout().expect(204);
        expect(await auditRows('LOGOUT', session.user.id)).toHaveLength(1);
      });

      it('answers 403 without the custom header and keeps the session', async () => {
        const session = await loginAs(t, 'ACCOUNTANT');
        await logout(session.cookie, {}).expect(403);
        await me(session.accessToken).expect(200);
      });

      it('only ends the session it belongs to', async () => {
        const user: CreatedUser = await createUser(t, { role: 'ACCOUNTANT' });
        const laptop = await login(t, user);
        const phone = await login(t, user);
        await logout(laptop.cookie).expect(204);
        await me(laptop.accessToken).expect(401);
        await me(phone.accessToken).expect(200);
      });
    });

    it('protects every route that is not explicitly public', async () => {
      const express = t.app.getHttpAdapter().getInstance() as {
        router: {
          stack: {
            route?: { path: string; methods: Record<string, boolean> };
          }[];
        };
      };
      // Wildcard layers are middleware (logging), and the Swagger UI routes are
      // not controllers; everything else is an endpoint the app exposes.
      const routes = express.router.stack
        .flatMap((layer) =>
          layer.route
            ? Object.keys(layer.route.methods).map((method) => ({
                method: method.toUpperCase(),
                path: layer.route?.path ?? '',
              }))
            : [],
        )
        .filter(
          ({ path }) => path.startsWith('/') && !path.startsWith('/api/docs'),
        )
        .filter(({ path }) => !/[{*]/.test(path));

      const reachable: string[] = [];
      for (const { method, path } of routes) {
        const url = path.replace(/:[A-Za-z]+/g, randomUUID());
        const res = await t
          .http()
          [method === 'POST' ? 'post' : 'get'](url)
          .send({});
        if (res.status !== 401) reachable.push(`${method} ${path}`);
      }

      expect(reachable.sort()).toEqual(
        [
          'GET /health',
          'POST /auth/login',
          'POST /auth/logout',
          'POST /auth/refresh',
        ].sort(),
      );
      expect(
        routes.every(({ method }) => method === 'GET' || method === 'POST'),
      ).toBe(true);
      expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual(
        expect.arrayContaining([
          'GET /invoices',
          'POST /invoices',
          'GET /invoices/:id',
        ]),
      );
    });
  });

  describe('throttling', () => {
    let t: TestApp;
    let clientIp = 0;
    const nextIp = (): string => {
      clientIp += 1;
      return `198.51.100.${clientIp}`;
    };

    beforeAll(async () => {
      t = await createTestApp({
        database,
        env: { THROTTLE_GLOBAL_LIMIT: '5', THROTTLE_LOGIN_LIMIT: '3' },
      });
    });

    afterAll(() => t.close());

    it('runs before authentication, so an anonymous flood gets 429 not 401', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await t
          .http()
          .get('/auth/me')
          .set(HTTP_HEADERS.X_FORWARDED_FOR, ip);
        statuses.push(res.status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
      const res = await t
        .http()
        .get('/auth/me')
        .set(HTTP_HEADERS.X_FORWARDED_FOR, nextIp());
      expect(res.status).toBe(401);
    });

    it('limits login per IP before any password is checked', async () => {
      const ip = nextIp();
      const email = `flood-${randomUUID()}@example.test`;
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await t
          .http()
          .post('/auth/login')
          .set(HTTP_HEADERS.X_FORWARDED_FOR, ip)
          .send({ email, password: 'guess' });
        statuses.push(res.status);
        if (res.status === 429) {
          expect(res.body).toEqual({
            statusCode: 429,
            message: expect.any(String) as unknown,
            error: 'Too Many Requests',
          });
        }
      }
      expect(statuses).toEqual([401, 401, 401, 429]);
      const audited = await t.db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM audit_events WHERE action = 'LOGIN_FAILED' AND metadata->>'emailHash' = ${sha256Hex(email)}`,
      );
      expect(audited.rows[0].n).toBe(3);
    });
  });
});
