import type { Role } from '../common/auth/permissions';
import type { LoginResponseDto } from './dto/auth-response.dto';

/** A login or refresh result: the response body plus the new refresh cookie value. */
export interface AuthSession {
  body: LoginResponseDto;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export type LoginFailureReason = 'UNKNOWN_USER' | 'LOCKED' | 'BAD_PASSWORD';

/** A freshly minted refresh token. `token` is the raw value for the cookie only. */
export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: Date;
}

/** Outcome of presenting a refresh token; only `rotated` may continue. */
export type RotationResult =
  | ({ kind: 'rotated'; userId: string } & IssuedRefreshToken)
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reused' };

export interface AccessTokenSubject {
  userId: string;
  sessionId: string;
  role: Role;
}

/** Claims of a verified access token (SPEC 7.2). No email or other PII. */
export interface AccessTokenClaims {
  sub: string;
  sid: string;
  role: Role;
  jti: string;
  iat: number;
  exp: number;
}

export interface NewRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  familyExpiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  familyExpiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

export interface SessionUser {
  id: string;
  role: Role;
}

/** A refresh token row as stored: the record plus its hash. */
export type StoredRefreshToken = RefreshTokenRecord & { tokenHash: string };
