export interface IdempotencyRequest {
  userId: string;
  key: string;
  method: string;
  path: string;
  /** Result of `fingerprint()`. */
  requestHash: string;
}

export interface StoredResponse {
  status: number;
  body: unknown;
}

export type IdempotencyBegin =
  { kind: 'new' } | { kind: 'replay'; response: StoredResponse };

export interface PgErrorInfo {
  /** SQLSTATE such as 23505 (unique violation) or 55P03 (lock not available). */
  code?: string;
  constraint?: string;
}
