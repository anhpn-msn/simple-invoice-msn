import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { FixedClock } from '../common/clock';
import type { AppConfig } from '../config/config.types';
import { AppConfigService } from '../config/app-config.service';
import { InvalidAccessTokenError, TokenService } from './token.service';

const secret = randomBytes(32).toString('base64url');
const config = {
  jwtSecret: secret,
  jwtIssuer: 'simple-invoice-api',
  jwtAudience: 'simple-invoice-web',
  jwtAccessTtlSeconds: 3600,
} as AppConfig;
const subject = {
  userId: randomUUID(),
  sessionId: randomUUID(),
  role: 'AUDITOR' as const,
};

const signer = new JwtService();
const sign = (
  payload: Record<string, unknown>,
  key: string | Buffer,
  options: { algorithm: 'HS256' | 'HS512' },
): string =>
  signer.sign(payload, { secret: key, algorithm: options.algorithm });

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('TokenService', () => {
  let clock: FixedClock;
  let service: TokenService;
  const nowSeconds = (): number => Math.floor(clock.now().getTime() / 1000);
  const validClaims = (): Record<string, unknown> => ({
    sub: subject.userId,
    sid: subject.sessionId,
    role: subject.role,
    jti: randomUUID(),
    iat: nowSeconds(),
    exp: nowSeconds() + 60,
    iss: config.jwtIssuer,
    aud: config.jwtAudience,
  });

  beforeEach(() => {
    clock = new FixedClock('2026-09-30T00:00:00.000Z');
    service = new TokenService(
      new JwtService({ secret }),
      new AppConfigService(config),
      clock,
    );
  });

  it('round-trips the claims and carries no PII', async () => {
    const token = await service.signAccessToken(subject);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map(
        (p) =>
          JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<
            string,
            unknown
          >,
      );
    expect(header.alg).toBe('HS256');
    expect(Object.keys(payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'sid', 'sub'].sort(),
    );
    expect(payload.exp).toBe(nowSeconds() + 3600);

    const claims = await service.verifyAccessToken(token);
    expect(claims).toMatchObject({
      sub: subject.userId,
      sid: subject.sessionId,
      role: 'AUDITOR',
    });
  });

  it('uses the injected clock for expiry', async () => {
    const token = await service.signAccessToken(subject);
    clock.set(new Date(clock.now().getTime() + 3599_000));
    await expect(service.verifyAccessToken(token)).resolves.toBeDefined();
    clock.set(new Date(clock.now().getTime() + 1000));
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects alg none', async () => {
    const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(validClaims())}.`;
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects another HMAC algorithm even with the right secret', async () => {
    const token = sign(validClaims(), secret, { algorithm: 'HS512' });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const token = sign(validClaims(), randomBytes(32), { algorithm: 'HS256' });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it.each([
    ['audience', { aud: 'someone-else' }],
    ['issuer', { iss: 'someone-else' }],
  ])('rejects a wrong %s', async (_name, override) => {
    const token = sign({ ...validClaims(), ...override }, secret, {
      algorithm: 'HS256',
    });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token without exp', async () => {
    const claims = validClaims();
    delete claims.exp;
    const token = sign(claims, secret, { algorithm: 'HS256' });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it.each([
    ['sub is not a uuid', { sub: '1 OR 1=1' }],
    ['sid is missing', { sid: undefined }],
    ['role is unknown', { role: 'ADMIN' }],
  ])('rejects claims where %s', async (_name, override) => {
    const token = sign({ ...validClaims(), ...override }, secret, {
      algorithm: 'HS256',
    });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects a tampered payload', async () => {
    const token = await service.signAccessToken(subject);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${base64url({ ...validClaims(), role: 'ACCOUNTANT' })}.${signature}`;
    await expect(service.verifyAccessToken(forged)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });
});
