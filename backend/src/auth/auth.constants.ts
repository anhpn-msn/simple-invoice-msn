/** Value clients must send in X-Requested-With on the cookie endpoints (CSRF defense, SPEC 7.3). */
export const CSRF_HEADER_VALUE = 'SimpleInvoice';

/** Authorization scheme of the access token (RFC 6750). */
export const BEARER_SCHEME = 'Bearer';

/** Fetch metadata values a same-site browser request may carry. */
export const ALLOWED_FETCH_SITES: ReadonlySet<string> = new Set([
  'same-origin',
  'none',
]);

/**
 * First key of the two-key advisory lock that serializes every change to one
 * refresh token family (rotate, logout, reuse revoke); the second key is a
 * hash of the family id. PostgreSQL keeps two-key advisory locks apart from
 * one-key (bigint) locks, and each purpose gets its own first key, so another
 * advisory lock added later cannot share a key with this one as long as it
 * picks a different number here.
 */
export const REFRESH_FAMILY_LOCK_NAMESPACE = 1;
