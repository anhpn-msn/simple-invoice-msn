import { randomUUID } from 'node:crypto';
import type { AuditEvent, AuditService } from '../audit';
import { FixedClock } from '../common/clock';
import type { AppConfig } from '../config/config.types';
import { AppConfigService } from '../config/app-config.service';
import type { Transaction } from '../database/database.types';
import type { RefreshTokenRepository } from './refresh-token.repository';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  StoredRefreshToken,
} from './auth.types';
import {
  hashRefreshToken,
  isWellFormedRefreshToken,
  RefreshTokenService,
} from './refresh-token.service';
import { MS_PER_SECOND } from '../common/clock/clock.constants';

/** In-memory stand-in that mirrors the repository's observable behaviour. */
class FakeRefreshTokenRepository {
  rows: StoredRefreshToken[] = [];
  readonly tx = {} as Transaction;
  /** Read and lock calls in order, to check the lock order of rotate. */
  calls: string[] = [];

  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return work(this.tx);
  }

  insert(token: NewRefreshToken): Promise<void> {
    this.rows.push({ ...token, revokedAt: null, replacedBy: null });
    return Promise.resolve();
  }

  findByHashForUpdate(
    _tx: Transaction,
    hash: string,
  ): Promise<RefreshTokenRecord | null> {
    this.calls.push('findByHashForUpdate');
    return Promise.resolve(this.rows.find((r) => r.tokenHash === hash) ?? null);
  }

  findByHash(hash: string): Promise<RefreshTokenRecord | null> {
    this.calls.push('findByHash');
    return Promise.resolve(this.rows.find((r) => r.tokenHash === hash) ?? null);
  }

  lockFamily(_tx: Transaction, familyId: string): Promise<void> {
    this.calls.push(`lockFamily:${familyId}`);
    return Promise.resolve();
  }

  markRotated(
    _tx: Transaction,
    id: string,
    replacedBy: string,
    now: Date,
  ): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, { revokedAt: now, replacedBy });
    return Promise.resolve();
  }

  revokeFamily(_tx: Transaction, familyId: string, now: Date): Promise<number> {
    const live = this.rows.filter(
      (r) => r.familyId === familyId && r.revokedAt === null,
    );
    live.forEach((r) => (r.revokedAt = now));
    return Promise.resolve(live.length);
  }
}

const TOKEN_TTL = 7 * 24 * 3600;
const FAMILY_TTL = 30 * 24 * 3600;
const context = {
  requestId: randomUUID(),
  ip: '203.0.113.7',
  userAgent: 'jest',
};

describe('RefreshTokenService', () => {
  let clock: FixedClock;
  let repo: FakeRefreshTokenRepository;
  let events: AuditEvent[];
  let audit: AuditService;
  let service: RefreshTokenService;
  const userId = randomUUID();

  const advance = (seconds: number): void =>
    clock.set(new Date(clock.now().getTime() + seconds * MS_PER_SECOND));

  beforeEach(() => {
    clock = new FixedClock('2026-09-30T00:00:00.000Z');
    repo = new FakeRefreshTokenRepository();
    events = [];
    audit = {
      record: (event: AuditEvent) => {
        events.push(event);
        return Promise.resolve();
      },
    } as unknown as AuditService;
    service = new RefreshTokenService(
      repo as unknown as RefreshTokenRepository,
      audit,
      new AppConfigService({
        refreshTokenTtlSeconds: TOKEN_TTL,
        refreshFamilyTtlSeconds: FAMILY_TTL,
      } as AppConfig),
      clock,
    );
  });

  it('issues a 256-bit base64url token and stores only its SHA-256', async () => {
    const issued = await service.issue(userId, context);
    expect(isWellFormedRefreshToken(issued.token)).toBe(true);
    expect(repo.rows).toHaveLength(1);
    const [row] = repo.rows;
    expect(row.tokenHash).toBe(hashRefreshToken(issued.token));
    expect(JSON.stringify(row)).not.toContain(issued.token);
    expect(row.familyId).toBe(issued.familyId);
    expect(row.expiresAt.getTime() - clock.now().getTime()).toBe(
      TOKEN_TTL * MS_PER_SECOND,
    );
    expect(row.familyExpiresAt.getTime() - clock.now().getTime()).toBe(
      FAMILY_TTL * MS_PER_SECOND,
    );
  });

  it('rotates to a successor in the same family and links the old row', async () => {
    const issued = await service.issue(userId, context);
    advance(60);
    const result = await service.rotate(issued.token, context);
    expect(result.kind).toBe('rotated');
    if (result.kind !== 'rotated') return;
    expect(result.familyId).toBe(issued.familyId);
    expect(result.token).not.toBe(issued.token);
    const [old, successor] = repo.rows;
    expect(old.replacedBy).toBe(successor.id);
    expect(old.revokedAt).toEqual(clock.now());
    expect(successor.familyExpiresAt).toEqual(old.familyExpiresAt);
    expect(events.map((e) => e.action)).toEqual(['TOKEN_REFRESHED']);
  });

  it('treats a replayed token as theft and revokes the whole family', async () => {
    const issued = await service.issue(userId, context);
    const rotated = await service.rotate(issued.token, context);
    expect(rotated.kind).toBe('rotated');

    await expect(service.rotate(issued.token, context)).resolves.toEqual({
      kind: 'reused',
    });
    expect(repo.rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(events.at(-1)).toMatchObject({
      action: 'REFRESH_TOKEN_REUSE_DETECTED',
      actorUserId: userId,
      entityId: issued.familyId,
      metadata: { revokedTokens: 1 },
    });
    if (rotated.kind === 'rotated') {
      await expect(service.rotate(rotated.token, context)).resolves.toEqual({
        kind: 'reused',
      });
    }
  });

  it('never extends the family beyond its absolute lifetime', async () => {
    let token = (await service.issue(userId, context)).token;
    const familyEnd = repo.rows[0].familyExpiresAt.getTime();
    let lastExpiry = 0;
    for (let rotation = 0; rotation < 4; rotation += 1) {
      advance(6 * 24 * 3600);
      const result = await service.rotate(token, context);
      if (result.kind !== 'rotated')
        throw new Error(`unexpected ${result.kind}`);
      lastExpiry = result.expiresAt.getTime();
      expect(lastExpiry).toBeLessThanOrEqual(familyEnd);
      token = result.token;
    }
    expect(lastExpiry).toBe(familyEnd);
    advance(6 * 24 * 3600);
    await expect(service.rotate(token, context)).resolves.toEqual({
      kind: 'expired',
    });
  });

  it('reports an expired token without revoking anything', async () => {
    const issued = await service.issue(userId, context);
    advance(TOKEN_TTL);
    await expect(service.rotate(issued.token, context)).resolves.toEqual({
      kind: 'expired',
    });
    expect(repo.rows[0].revokedAt).toBeNull();
    expect(events).toEqual([]);
  });

  it.each([undefined, '', 'short', { j: 'object' }, `${'a'.repeat(43)}=`])(
    'rejects malformed input %p without touching storage',
    async (value) => {
      const spy = jest.spyOn(repo, 'transaction');
      await expect(service.rotate(value, context)).resolves.toEqual({
        kind: 'invalid',
      });
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('answers invalid for a well-formed but unknown token', async () => {
    await expect(service.rotate('A'.repeat(43), context)).resolves.toEqual({
      kind: 'invalid',
    });
  });

  it('revokes the family on logout, audits once, and is idempotent', async () => {
    const issued = await service.issue(userId, context);
    await service.revoke(issued.token, context);
    await service.revoke(issued.token, context);
    await service.revoke('garbage', context);
    expect(repo.rows[0].revokedAt).not.toBeNull();
    expect(events.map((e) => e.action)).toEqual(['LOGOUT']);
  });

  it('runs the logout revoke and its audit event in one transaction', async () => {
    const issued = await service.issue(userId, context);
    const revokeFamily = jest.spyOn(repo, 'revokeFamily');
    const record = jest.spyOn(audit, 'record');

    await service.revoke(issued.token, context);

    expect(revokeFamily).toHaveBeenCalledWith(
      repo.tx,
      issued.familyId,
      clock.now(),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGOUT' }),
      repo.tx,
    );
  });

  it('revokes the family on reuse inside the rotation transaction', async () => {
    const issued = await service.issue(userId, context);
    await service.rotate(issued.token, context);
    const revokeFamily = jest.spyOn(repo, 'revokeFamily');

    await service.rotate(issued.token, context);

    expect(revokeFamily).toHaveBeenCalledWith(
      repo.tx,
      issued.familyId,
      clock.now(),
    );
  });
  it('takes the family lock before locking the presented token', async () => {
    const issued = await service.issue(userId, context);
    const lockOrder = [
      'findByHash',
      `lockFamily:${issued.familyId}`,
      'findByHashForUpdate',
    ];

    repo.calls = [];
    await service.rotate(issued.token, context);
    expect(repo.calls).toEqual(lockOrder);

    repo.calls = [];
    await expect(service.rotate(issued.token, context)).resolves.toEqual({
      kind: 'reused',
    });
    expect(repo.calls).toEqual(lockOrder);
  });

  it('does not lock anything for an unknown token', async () => {
    await service.rotate('A'.repeat(43), context);
    expect(repo.calls).toEqual(['findByHash']);
  });
});
