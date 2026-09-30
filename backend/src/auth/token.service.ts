import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { ROLES, type Role } from '../common/auth/permissions';
import { CLOCK, MS_PER_SECOND, type Clock } from '../common/clock';
import { AppConfigService } from '../config/app-config.service';
import type { AccessTokenClaims, AccessTokenSubject } from './auth.types';

const ALGORITHM = 'HS256';

/** Thrown for any token that must not be trusted; callers map it to 401. */
export class InvalidAccessTokenError extends Error {
  constructor() {
    super('Invalid access token');
    this.name = 'InvalidAccessTokenError';
  }
}

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

function toClaims(payload: unknown): AccessTokenClaims {
  const p = (
    typeof payload === 'object' && payload !== null ? payload : {}
  ) as Record<string, unknown>;
  // sub and sid are bound into uuid columns, so a malformed value must never
  // reach the database (it would surface as a 500 instead of a 401).
  if (
    typeof p.sub !== 'string' ||
    !isUUID(p.sub) ||
    typeof p.sid !== 'string' ||
    !isUUID(p.sid) ||
    !isRole(p.role) ||
    typeof p.jti !== 'string' ||
    typeof p.iat !== 'number' ||
    typeof p.exp !== 'number'
  ) {
    throw new InvalidAccessTokenError();
  }
  return {
    sub: p.sub,
    sid: p.sid,
    role: p.role,
    jti: p.jti,
    iat: p.iat,
    exp: p.exp,
  };
}

/**
 * Signs and verifies access JWTs. The algorithm, issuer and audience are
 * pinned on every call (RFC 8725), and time comes from the injected Clock so
 * signing, verification and session expiry share one time source.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('jwtAccessTtlSeconds');
  }

  signAccessToken(subject: AccessTokenSubject): Promise<string> {
    const payload = {
      sid: subject.sessionId,
      role: subject.role,
      iat: this.nowSeconds(),
    };
    return this.jwt.signAsync(payload, {
      algorithm: ALGORITHM,
      subject: subject.userId,
      issuer: this.config.get('jwtIssuer'),
      audience: this.config.get('jwtAudience'),
      expiresIn: this.accessTokenTtlSeconds,
      jwtid: randomUUID(),
    });
  }

  /** Verifies signature, algorithm, iss, aud and exp; throws InvalidAccessTokenError. */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, {
        algorithms: [ALGORITHM],
        issuer: this.config.get('jwtIssuer'),
        audience: this.config.get('jwtAudience'),
        clockTimestamp: this.nowSeconds(),
      });
    } catch {
      throw new InvalidAccessTokenError();
    }
    return toClaims(payload);
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / MS_PER_SECOND);
  }
}
