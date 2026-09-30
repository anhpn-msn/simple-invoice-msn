/** Header names as written on the wire (canonical case). */
export const HTTP_HEADERS = {
  AUTHORIZATION: 'Authorization',
  CACHE_CONTROL: 'Cache-Control',
  CONTENT_TYPE: 'Content-Type',
  COOKIE: 'Cookie',
  IDEMPOTENCY_KEY: 'Idempotency-Key',
  IDEMPOTENT_REPLAYED: 'Idempotent-Replayed',
  LOCATION: 'Location',
  ORIGIN: 'Origin',
  REQUEST_ID: 'X-Request-Id',
  REQUESTED_WITH: 'X-Requested-With',
  SEC_FETCH_SITE: 'Sec-Fetch-Site',
  SET_COOKIE: 'Set-Cookie',
  USER_AGENT: 'User-Agent',
  WWW_AUTHENTICATE: 'WWW-Authenticate',
  X_FORWARDED_FOR: 'X-Forwarded-For',
} as const;

/** Node lowercases incoming header names, so lookups in `req.headers` need this form. */
export const headerKey = (name: string): string => name.toLowerCase();

export const CACHE_CONTROL_NO_STORE = 'no-store';

/** Value of `Idempotent-Replayed` on a replayed response. */
export const IDEMPOTENT_REPLAYED_TRUE = 'true';
