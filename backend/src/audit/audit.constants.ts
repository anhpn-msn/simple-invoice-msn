export const AUDIT_ACTIONS = [
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'ACCOUNT_LOCKED',
  'TOKEN_REFRESHED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'LOGOUT',
  'INVOICE_CREATED',
  'ACCESS_DENIED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Values of `audit_events.entity_type`. */
export const AUDIT_ENTITY_TYPES = {
  USER: 'user',
  SESSION: 'session',
  INVOICE: 'invoice',
} as const;

export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];
