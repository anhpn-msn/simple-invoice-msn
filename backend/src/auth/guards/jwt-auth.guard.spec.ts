import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { FixedClock } from '../../common/clock';
import type { RefreshTokenRepository } from '../refresh-token.repository';
import type { SessionUser } from '../auth.types';
import { InvalidAccessTokenError, type TokenService } from '../token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { BEARER_SCHEME } from '../auth.constants';
import { HTTP_HEADERS } from '../../common/http/http-headers.constants';

const TOKEN = 'aaa.bbb.ccc';

describe('JwtAuthGuard', () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  let isPublic: boolean;
  let verify: jest.Mock;
  let findSession: jest.Mock<
    Promise<SessionUser | null>,
    [string, string, Date]
  >;
  let guard: JwtAuthGuard;
  let request: { headers: Record<string, string>; user?: AuthPrincipal };
  let setHeader: jest.Mock;

  const context = (): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    isPublic = false;
    verify = jest
      .fn()
      .mockResolvedValue({ sub: userId, sid: sessionId, role: 'ACCOUNTANT' });
    findSession = jest
      .fn<Promise<SessionUser | null>, [string, string, Date]>()
      .mockResolvedValue({ id: userId, role: 'AUDITOR' });
    setHeader = jest.fn();
    request = { headers: { authorization: `${BEARER_SCHEME} ${TOKEN}` } };
    const reflector = {
      getAllAndOverride: () => isPublic,
    } as unknown as Reflector;
    guard = new JwtAuthGuard(
      reflector,
      { verifyAccessToken: verify } as unknown as TokenService,
      {
        findActiveSessionUser: findSession,
      } as unknown as RefreshTokenRepository,
      new FixedClock('2026-09-30T00:00:00.000Z'),
    );
  });

  it('skips @Public routes without looking at the header', async () => {
    isPublic = true;
    request.headers = {};
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('attaches the principal with the role from the database', async () => {
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(findSession).toHaveBeenCalledWith(
      userId,
      sessionId,
      expect.any(Date),
    );
    expect(request.user).toEqual({
      userId,
      sessionId,
      role: 'AUDITOR',
      permissions: ['invoice:read'],
    });
  });

  it.each([
    ['no header', undefined],
    ['another scheme', `Basic ${TOKEN}`],
    ['a token in the wrong shape', `${BEARER_SCHEME} not-a-jwt`],
    ['extra content', `${BEARER_SCHEME} ${TOKEN} extra`],
  ])('answers 401 with WWW-Authenticate for %s', async (_name, header) => {
    request.headers = header === undefined ? {} : { authorization: header };
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(setHeader).toHaveBeenCalledWith(
      HTTP_HEADERS.WWW_AUTHENTICATE,
      BEARER_SCHEME,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('answers 401 when the signature or claims are invalid', async () => {
    verify.mockRejectedValue(new InvalidAccessTokenError());
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findSession).not.toHaveBeenCalled();
  });

  it('answers 401 when the session was revoked', async () => {
    findSession.mockResolvedValue(null);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('does not hide infrastructure failures as 401', async () => {
    findSession.mockRejectedValue(new Error('db down'));
    await expect(guard.canActivate(context())).rejects.toThrow('db down');
  });
});
