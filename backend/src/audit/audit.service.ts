import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { DRIZZLE } from '../database/database.module';
import type { Database, DbExecutor } from '../database/database.types';
import { auditEvents } from '../database/schema';
import type { AuditEvent } from './audit.types';

/** Append-only writer for the security and business audit trail. */
@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Pass the caller's transaction when the event must commit or roll back
   * together with the business change it describes (for example INVOICE_CREATED).
   */
  async record(event: AuditEvent, tx?: DbExecutor): Promise<void> {
    const executor = tx ?? this.db;
    const ip = event.context?.ip;
    await executor.insert(auditEvents).values({
      action: event.action,
      outcome: event.outcome,
      actorUserId: event.actorUserId ?? null,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      requestId: event.context?.requestId ?? null,
      // The column is inet, so anything that is not an IP would abort the insert.
      ip: ip && isIP(ip) ? ip : null,
      userAgent: event.context?.userAgent ?? null,
      metadata: event.metadata ?? {},
    });
  }
}
