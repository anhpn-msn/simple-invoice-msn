import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { Response } from 'supertest';
import { BEARER_SCHEME } from '../src/auth/auth.constants';
import { hashRefreshToken } from '../src/auth/refresh-token.service';
import {
  HTTP_HEADERS,
  headerKey,
} from '../src/common/http/http-headers.constants';
import { RefreshTokenRepository } from '../src/auth/refresh-token.repository';
import { uuidv7 } from '../src/common/ids/uuidv7';
import * as schema from '../src/database/schema';
import { refreshTokens } from '../src/database/schema';
import { CSRF_HEADERS, extractRefreshCookie, loginAs } from './utils/auth';
import { createTestApp } from './utils/test-app';
import type { AuditRow, LoginResult, TestApp } from './utils/test.types';

const POLL_INTERVAL_MS = 20;
const BLOCKED_TIMEOUT_MS = 10_000;
const TOKEN_BYTES = 32;

/** pg's Client.prototype.query, seen loosely so a test can wrap it. */
type QueryMethod = (this: Client, ...args: unknown[]) => unknown;

/**
 * A rotation paused just before COMMIT, doing exactly what
 * RefreshTokenService.rotate does with the real repository: take the family
 * lock, lock the presented row, and if it is still live insert the successor
 * and mark the old row rotated. It runs on its own connection so the app's
 * statements really queue behind its locks, which makes the M1 race (T12
 * security review) deterministic instead of timing based.
 */
interface InFlightRotation {
  familyId: string;
  /** Raw successor token, or null when the presented token was not live. */
  successorToken: string | null;
  commit(): Promise<void>;
}

describe('Refresh family revoke racing a rotation (e2e)', () => {
  let t: TestApp;
  const openClients: Client[] = [];
  let restoreQuery = (): void => undefined;

  const rawTokenOf = (cookie: string): string =>
    cookie.slice(cookie.indexOf('=') + 1);

  const refresh = (cookie: string): Promise<Response> =>
    t
      .http()
      .post('/auth/refresh')
      .set(CSRF_HEADERS)
      .set(HTTP_HEADERS.COOKIE, cookie)
      .then((res) => res);

  const logout = (cookie: string): Promise<Response> =>
    t
      .http()
      .post('/auth/logout')
      .set(CSRF_HEADERS)
      .set(HTTP_HEADERS.COOKIE, cookie)
      .then((res) => res);

  const me = (accessToken: string): Promise<Response> =>
    t
      .http()
      .get('/auth/me')
      .set(HTTP_HEADERS.AUTHORIZATION, `${BEARER_SCHEME} ${accessToken}`)
      .then((res) => res);

  async function beginRotation(rawToken: string): Promise<InFlightRotation> {
    const client = new Client({ connectionString: t.databaseUrl });
    await client.connect();
    openClients.push(client);
    const repo = new RefreshTokenRepository(drizzle(client, { schema }));
    const tokenHash = hashRefreshToken(rawToken);

    let finish = (): void => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    return new Promise<InFlightRotation>((resolve, reject) => {
      const done = repo.transaction(async (tx) => {
        const presented = await repo.findByHash(tokenHash, tx);
        if (!presented) throw new Error('the token to rotate does not exist');
        await repo.lockFamily(tx, presented.familyId);
        const current = await repo.findByHashForUpdate(tx, tokenHash);
        if (!current) throw new Error('the token to rotate disappeared');

        let successorToken: string | null = null;
        if (current.revokedAt === null) {
          successorToken = randomBytes(TOKEN_BYTES).toString('base64url');
          const successorId = uuidv7();
          await repo.insert(
            {
              id: successorId,
              userId: current.userId,
              familyId: current.familyId,
              tokenHash: hashRefreshToken(successorToken),
              expiresAt: current.expiresAt,
              familyExpiresAt: current.familyExpiresAt,
              userAgent: null,
              ip: null,
            },
            tx,
          );
          await repo.markRotated(tx, current.id, successorId, new Date());
        }
        resolve({
          familyId: current.familyId,
          successorToken,
          commit: async () => {
            finish();
            await done;
          },
        });
        await finished;
      });
      done.catch(reject);
    });
  }

  /**
   * Holds back the app's next family revoke UPDATE in Node, after its lock
   * step, until `release` is called. This opens, on purpose, the gap between
   * the two statements of a lock-then-update revoke.
   */
  function pauseNextFamilyRevokeUpdate(): {
    reached: Promise<void>;
    release(): void;
  } {
    const original = Reflect.get(Client.prototype, 'query') as QueryMethod;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let markReached = (): void => undefined;
    const reached = new Promise<void>((resolve) => (markReached = resolve));
    restoreQuery = () => Reflect.set(Client.prototype, 'query', original);
    const gated: QueryMethod = function (this: Client, ...args) {
      const [config] = args;
      const text =
        typeof config === 'object' && config !== null && 'text' in config
          ? String(config.text)
          : '';
      if (
        text.startsWith('update "refresh_tokens" set "revoked_at"') &&
        text.includes('"family_id"')
      ) {
        restoreQuery();
        markReached();
        return gate.then(() => Reflect.apply(original, this, args));
      }
      return Reflect.apply(original, this, args);
    };
    Reflect.set(Client.prototype, 'query', gated);
    return { reached, release };
  }

  /** Polls until `check` is true; fails the test after BLOCKED_TIMEOUT_MS. */
  async function waitFor(
    check: () => Promise<boolean>,
    what: string,
  ): Promise<void> {
    const deadline = Date.now() + BLOCKED_TIMEOUT_MS;
    while (!(await check())) {
      if (Date.now() > deadline)
        throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  const blockedBackends = async (): Promise<number> => {
    const blocked = await t.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0`,
    );
    return blocked.rows[0].n;
  };

  /**
   * Waits until `count` backends are stuck on a lock. A second waiter for the
   * same lock queues behind the first waiter, not behind the rotation, so this
   * counts any blocked backend instead of those blocked by one pid.
   */
  const waitUntilBlocked = (count: number): Promise<void> =>
    waitFor(
      async () => (await blockedBackends()) >= count,
      `${count} blocked backend(s)`,
    );

  const liveTokens = async (familyId: string): Promise<number> => {
    const [row] = await t.db
      .select({ n: sql<number>`count(*)::int` })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
        ),
      );
    return row.n;
  };

  const auditRows = async (
    action: string,
    actor: string,
  ): Promise<AuditRow[]> => {
    const result = await t.db.execute<AuditRow>(
      sql`SELECT action, actor_user_id, metadata FROM audit_events WHERE action = ${action} AND actor_user_id = ${actor} ORDER BY id`,
    );
    return result.rows;
  };

  /** Logs in and rotates once, so the family has one used and one live token. */
  const sessionWithHistory = async (): Promise<{
    session: LoginResult;
    current: string;
    currentAccess: string;
  }> => {
    const session = await loginAs(t, 'ACCOUNTANT');
    const rotated = await refresh(session.cookie);
    expect(rotated.status).toBe(200);
    const current = extractRefreshCookie(
      t,
      rotated.headers[headerKey(HTTP_HEADERS.SET_COOKIE)],
    );
    if (!current) throw new Error('refresh did not set a new cookie');
    return {
      session,
      current,
      currentAccess: (rotated.body as { accessToken: string }).accessToken,
    };
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterEach(async () => {
    restoreQuery();
    // Ending a client that is still inside BEGIN rolls its work back, so a
    // failed test never leaves a lock that would hang the next one.
    await Promise.all(openClients.splice(0).map((client) => client.end()));
    await t.truncateBusinessTables();
  });

  afterAll(() => t.close());

  it('logout during a rotation still revokes the successor and audits LOGOUT', async () => {
    const session = await loginAs(t, 'ACCOUNTANT');
    const rotation = await beginRotation(rawTokenOf(session.cookie));

    const pendingLogout = logout(session.cookie);
    await waitUntilBlocked(1);
    await rotation.commit();

    expect((await pendingLogout).status).toBe(204);
    expect(await liveTokens(rotation.familyId)).toBe(0);
    expect((await me(session.accessToken)).status).toBe(401);
    const events = await auditRows('LOGOUT', session.user.id);
    expect(events.map((e) => e.metadata)).toEqual([{ revokedTokens: 1 }]);
  });

  it('reuse detection during a rotation still revokes the successor', async () => {
    const { session, current, currentAccess } = await sessionWithHistory();
    const rotation = await beginRotation(rawTokenOf(current));

    const pendingReplay = refresh(session.cookie);
    await waitUntilBlocked(1);
    await rotation.commit();

    expect((await pendingReplay).status).toBe(401);
    expect(await liveTokens(rotation.familyId)).toBe(0);
    expect((await me(currentAccess)).status).toBe(401);
    const events = await auditRows(
      'REFRESH_TOKEN_REUSE_DETECTED',
      session.user.id,
    );
    expect(events.map((e) => e.metadata)).toEqual([{ revokedTokens: 1 }]);
  });

  it('logout and reuse detection queued on the same rotation revoke the successor exactly once', async () => {
    const { session, current, currentAccess } = await sessionWithHistory();
    const rotation = await beginRotation(rawTokenOf(current));

    const pendingLogout = logout(current);
    const pendingReplay = refresh(session.cookie);
    await waitUntilBlocked(2);
    await rotation.commit();

    expect((await pendingLogout).status).toBe(204);
    expect((await pendingReplay).status).toBe(401);
    expect(await liveTokens(rotation.familyId)).toBe(0);
    expect((await me(currentAccess)).status).toBe(401);
    // Whichever transaction got the successor first revoked it; the other
    // found nothing left, so exactly one token was revoked in total.
    const revoked = [
      ...(await auditRows('LOGOUT', session.user.id)),
      ...(await auditRows('REFRESH_TOKEN_REUSE_DETECTED', session.user.id)),
    ].reduce((sum, e) => sum + Number(e.metadata.revokedTokens), 0);
    expect(revoked).toBe(1);
  });

  it('logout survives a second rotation that starts between its lock and its update', async () => {
    const session = await loginAs(t, 'ACCOUNTANT');
    const first = await beginRotation(rawTokenOf(session.cookie));
    const successor = first.successorToken;
    if (!successor) throw new Error('the first rotation made no successor');
    const updateGate = pauseNextFamilyRevokeUpdate();

    const pendingLogout = logout(session.cookie);
    let logoutDone = false;
    void pendingLogout.finally(() => (logoutDone = true));
    await waitUntilBlocked(1);
    await first.commit();
    await updateGate.reached;

    // The client that got the successor rotates it at once. Without a family
    // lock this rotation is in flight when the revoke UPDATE runs; with it,
    // the rotation waits until the logout has committed.
    const second = beginRotation(successor);
    let secondStarted = false;
    void second.then(() => (secondStarted = true));
    await waitFor(
      async () => secondStarted || (await blockedBackends()) >= 1,
      'the second rotation to be in flight or waiting',
    );
    updateGate.release();
    await waitFor(
      async () => logoutDone || (await blockedBackends()) >= 1,
      'the revoke UPDATE to finish or to wait on the second rotation',
    );
    await (await second).commit();

    expect((await pendingLogout).status).toBe(204);
    expect(await liveTokens(first.familyId)).toBe(0);
    expect((await second).successorToken).toBeNull();
    expect((await me(session.accessToken)).status).toBe(401);
  });
});
