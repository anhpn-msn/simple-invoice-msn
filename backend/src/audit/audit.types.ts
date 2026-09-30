import type { AuditAction, AuditEntityType } from './audit.constants';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export interface AuditRequestContext {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  entityType?: AuditEntityType;
  entityId?: string;
  /** Never put secrets, passwords, tokens or raw unknown emails here. */
  metadata?: Record<string, unknown>;
  context?: AuditRequestContext;
}
