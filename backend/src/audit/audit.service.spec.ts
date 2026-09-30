import type { Request } from 'express';
import type { Database } from '../database/database.types';
import { AuditService } from './audit.service';
import { requestContext } from './request-context';
import { HTTP_HEADERS, headerKey } from '../common/http/http-headers.constants';

function fakeExecutor() {
  const values = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockReturnValue({ values });
  return { executor: { insert } as unknown as Database, insert, values };
}

describe('AuditService', () => {
  it('writes through the default client when no transaction is given', async () => {
    const db = fakeExecutor();
    await new AuditService(db.executor).record({
      action: 'LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      actorUserId: 'u1',
      context: { requestId: 'r1', ip: '10.0.0.1', userAgent: 'jest' },
    });
    expect(db.values).toHaveBeenCalledWith({
      action: 'LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      actorUserId: 'u1',
      entityType: null,
      entityId: null,
      requestId: 'r1',
      ip: '10.0.0.1',
      userAgent: 'jest',
      metadata: {},
    });
  });

  it('uses the caller transaction so the event commits with the business change', async () => {
    const db = fakeExecutor();
    const tx = fakeExecutor();
    await new AuditService(db.executor).record(
      {
        action: 'INVOICE_CREATED',
        outcome: 'SUCCESS',
        entityType: 'invoice',
        entityId: 'i1',
      },
      tx.executor,
    );
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('drops an ip that is not a valid address instead of failing the insert', async () => {
    const db = fakeExecutor();
    await new AuditService(db.executor).record({
      action: 'LOGIN_FAILED',
      outcome: 'FAILURE',
      context: { ip: 'not-an-ip' },
    });
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ ip: null, actorUserId: null }),
    );
  });
});

describe('requestContext', () => {
  it('reads request id, ip and a truncated user agent', () => {
    const req = {
      id: 'req-1',
      ip: '::ffff:127.0.0.1',
      headers: { [headerKey(HTTP_HEADERS.USER_AGENT)]: 'x'.repeat(400) },
    } as unknown as Request;
    const context = requestContext(req);
    expect(context.requestId).toBe('req-1');
    expect(context.ip).toBe('::ffff:127.0.0.1');
    expect(context.userAgent).toHaveLength(300);
  });
});
