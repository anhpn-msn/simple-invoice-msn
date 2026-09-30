import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, AuditService } from '../audit';
import { FixedClock } from '../common/clock';
import type { AppConfig } from '../config/config.types';
import { AppConfigService } from '../config/app-config.service';
import type { Database } from '../database/database.types';
import type { UsersRepository } from '../users/users.repository';
import type { LoginAttemptReservation, UserRecord } from '../users/users.types';
import { AuthService, INVALID_CREDENTIALS } from './auth.service';
import type { PasswordHasher } from './password-hasher';
import type { RefreshTokenService } from './refresh-token.service';
import type { RotationResult } from './auth.types';
import type { TokenService } from './token.service';
import { BEARER_SCHEME } from './auth.constants';
import { sha256Hex } from '../common/crypto/sha256';

const context = {
  requestId: randomUUID(),
  ip: '203.0.113.9',
  userAgent: 'jest',
};
const PASSWORD = 'the-right-password';

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: randomUUID(),
    email: 'accountant@example.com',
    passwordHash: 'stored-hash',
    fullname: 'Demo Accountant',
    role: 'ACCOUNTANT',
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let clock: FixedClock;
  let events: AuditEvent[];
  let users: {
    findByEmail: jest.Mock<Promise<UserRecord | null>, [string]>;
    findById: jest.Mock<Promise<UserRecord | null>, [string]>;
    reserveLoginAttempt: jest.Mock<
      Promise<LoginAttemptReservation>,
      [string, Date, (attempts: number) => Date | null]
    >;
    resetLoginFailures: jest.Mock<Promise<void>, unknown[]>;
  };
  let hasher: { verify: jest.Mock<Promise<boolean>, [string, string | null]> };
  let refreshTokens: {
    issue: jest.Mock;
    rotate: jest.Mock<Promise<RotationResult>, unknown[]>;
    revoke: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    clock = new FixedClock('2026-09-30T00:00:00.000Z');
    events = [];
    users = {
      findByEmail: jest.fn<Promise<UserRecord | null>, [string]>(),
      findById: jest.fn<Promise<UserRecord | null>, [string]>(),
      reserveLoginAttempt: jest.fn<
        Promise<LoginAttemptReservation>,
        [string, Date, (attempts: number) => Date | null]
      >(),
      resetLoginFailures: jest
        .fn<Promise<void>, unknown[]>()
        .mockResolvedValue(undefined),
    };
    hasher = {
      verify: jest.fn((password: string, hash: string | null) =>
        Promise.resolve(hash !== null && password === PASSWORD),
      ),
    };
    refreshTokens = {
      issue: jest.fn().mockResolvedValue({
        token: 'raw-refresh',
        familyId: randomUUID(),
        expiresAt: new Date('2026-10-07T00:00:00.000Z'),
      }),
      rotate: jest.fn<Promise<RotationResult>, unknown[]>(),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    const tokens = {
      accessTokenTtlSeconds: 3600,
      signAccessToken: jest.fn().mockResolvedValue('signed.jwt.token'),
    };
    const audit = {
      record: (event: AuditEvent) => {
        events.push(event);
        return Promise.resolve();
      },
    };
    const db = {
      transaction: <T>(work: (tx: unknown) => Promise<T>) => work({}),
    };
    service = new AuthService(
      db as unknown as Database,
      users as unknown as UsersRepository,
      hasher as unknown as PasswordHasher,
      tokens as unknown as TokenService,
      refreshTokens as unknown as RefreshTokenService,
      audit as unknown as AuditService,
      new AppConfigService({
        loginMaxFailedAttempts: 5,
        loginLockoutMaxSeconds: 900,
      } as AppConfig),
      clock,
    );
  });

  const expectInvalidCredentials = async (
    promise: Promise<unknown>,
  ): Promise<void> => {
    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    await promise.catch((error: UnauthorizedException) =>
      expect(error.message).toBe(INVALID_CREDENTIALS),
    );
  };

  describe('login', () => {
    it('normalizes the email before lookup', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expectInvalidCredentials(
        service.login('  Accountant@Example.COM ', 'x', context),
      );
      expect(users.findByEmail).toHaveBeenCalledWith('accountant@example.com');
    });

    it('still runs a bcrypt compare for an unknown email and audits only its hash', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expectInvalidCredentials(
        service.login('ghost@example.com', 'guess', context),
      );
      expect(hasher.verify).toHaveBeenCalledWith('guess', null);
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event).toMatchObject({
        action: 'LOGIN_FAILED',
        actorUserId: null,
        metadata: {
          reason: 'UNKNOWN_USER',
          emailHash: sha256Hex('ghost@example.com'),
        },
      });
      expect(JSON.stringify(event)).not.toContain('ghost@example.com');
      expect(JSON.stringify(event)).not.toContain('guess');
    });

    it('skips the real compare while the account is locked', async () => {
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);
      users.reserveLoginAttempt.mockResolvedValue({ allowed: false });
      await expectInvalidCredentials(
        service.login(user.email, PASSWORD, context),
      );
      expect(hasher.verify).toHaveBeenCalledTimes(1);
      expect(hasher.verify).toHaveBeenCalledWith(PASSWORD, null);
      expect(refreshTokens.issue).not.toHaveBeenCalled();
      expect(events[0].metadata).toMatchObject({ reason: 'LOCKED' });
    });

    it('reserves the attempt with the progressive lockout policy', async () => {
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);
      users.reserveLoginAttempt.mockResolvedValue({
        allowed: true,
        attempts: 1,
        lockedUntil: null,
      });
      await expectInvalidCredentials(
        service.login(user.email, 'wrong', context),
      );
      const lockFor = users.reserveLoginAttempt.mock.calls[0][2];
      expect(lockFor(4)).toBeNull();
      expect(lockFor(5)?.getTime()).toBe(clock.now().getTime() + 30_000);
      expect(lockFor(7)?.getTime()).toBe(clock.now().getTime() + 120_000);
    });

    it('audits ACCOUNT_LOCKED when the failed attempt reaches the threshold', async () => {
      const user = makeUser();
      const lockedUntil = new Date(clock.now().getTime() + 30_000);
      users.findByEmail.mockResolvedValue(user);
      users.reserveLoginAttempt.mockResolvedValue({
        allowed: true,
        attempts: 5,
        lockedUntil,
      });
      await expectInvalidCredentials(
        service.login(user.email, 'wrong', context),
      );
      expect(events.map((e) => e.action)).toEqual([
        'ACCOUNT_LOCKED',
        'LOGIN_FAILED',
      ]);
      expect(events[1].metadata).toMatchObject({
        reason: 'BAD_PASSWORD',
        failedAttempts: 5,
      });
    });

    it('resets the counter, opens a session and returns the SPEC 6.1 body on success', async () => {
      const user = makeUser();
      users.findByEmail.mockResolvedValue(user);
      users.reserveLoginAttempt.mockResolvedValue({
        allowed: true,
        attempts: 3,
        lockedUntil: null,
      });
      const session = await service.login(user.email, PASSWORD, context);
      expect(users.resetLoginFailures).toHaveBeenCalledWith(
        user.id,
        clock.now(),
        {},
      );
      expect(refreshTokens.issue).toHaveBeenCalledWith(user.id, context, {});
      expect(session.refreshToken).toBe('raw-refresh');
      expect(session.body).toEqual({
        accessToken: 'signed.jwt.token',
        tokenType: BEARER_SCHEME,
        expiresIn: 3600,
        user: {
          id: user.id,
          email: user.email,
          fullname: user.fullname,
          role: 'ACCOUNTANT',
          permissions: ['invoice:read', 'invoice:create'],
        },
      });
      expect(events.map((e) => e.action)).toEqual(['LOGIN_SUCCEEDED']);
    });
  });

  describe('refresh', () => {
    it.each<RotationResult>([
      { kind: 'invalid' },
      { kind: 'expired' },
      { kind: 'reused' },
    ])('answers 401 for %p', async (result) => {
      refreshTokens.rotate.mockResolvedValue(result);
      await expect(service.refresh('token', context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('signs a new access token with the role from the database', async () => {
      const user = makeUser({ role: 'AUDITOR' });
      refreshTokens.rotate.mockResolvedValue({
        kind: 'rotated',
        userId: user.id,
        token: 'next',
        familyId: randomUUID(),
        expiresAt: new Date('2026-10-07T00:00:00.000Z'),
      });
      users.findById.mockResolvedValue(user);
      const session = await service.refresh('token', context);
      expect(session.refreshToken).toBe('next');
      expect(session.body.user.permissions).toEqual(['invoice:read']);
    });
  });
});
