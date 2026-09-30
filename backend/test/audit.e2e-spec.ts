import { sql } from 'drizzle-orm';
import { AuditService } from '../src/audit/audit.service';
import { createTestApp } from './utils/test-app';
import type { TestApp } from './utils/test.types';

describe('AuditService (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('persists an event that can never be updated afterwards', async () => {
    await t.app.get(AuditService).record({
      action: 'ACCESS_DENIED',
      outcome: 'FAILURE',
      metadata: { permission: 'invoice:create' },
      context: {
        requestId: 'e2e-audit',
        ip: '::ffff:127.0.0.1',
        userAgent: 'jest',
      },
    });

    const rows = await t.db.execute<{
      action: string;
      ip: string;
      metadata: unknown;
    }>(
      sql`SELECT action, host(ip) AS ip, metadata FROM audit_events WHERE request_id = 'e2e-audit'`,
    );
    expect(rows.rows).toEqual([
      {
        action: 'ACCESS_DENIED',
        ip: '::ffff:127.0.0.1',
        metadata: { permission: 'invoice:create' },
      },
    ]);

    await expect(
      t.db.execute(
        sql`UPDATE audit_events SET action = 'X' WHERE request_id = 'e2e-audit'`,
      ),
    ).rejects.toMatchObject({
      cause: { message: 'audit_events is append-only' },
    });
  });
});
