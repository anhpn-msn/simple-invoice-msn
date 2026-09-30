export const AUTH_THROTTLE_KEY = 'authThrottleScope';

/** Named throttlers that apply only to the handler that carries the matching decorator. */
export const AUTH_THROTTLE_SCOPES = ['login', 'refresh'] as const;
export type AuthThrottleScope = (typeof AUTH_THROTTLE_SCOPES)[number];
