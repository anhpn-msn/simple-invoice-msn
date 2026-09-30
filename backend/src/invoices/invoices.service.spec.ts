import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AUDIT_ENTITY_TYPES } from '../audit';
import type { AuditEvent, AuditService } from '../audit';
import type { AuthPrincipal } from '../common/auth/auth.types';
import type { BusinessCalendar } from '../common/clock';
import type { Database } from '../database/database.types';
import type { IdempotencyService } from '../idempotency';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import {
  CONFLICTING_REQUEST_IN_PROGRESS,
  DUPLICATE_INVOICE_NUMBER,
  IDEMPOTENCY_IN_PROGRESS,
  INVOICE_NUMBER_UNIQUE_INDEX,
} from './invoices.constants';
import { InvoicesService } from './invoices.service';
import type { InvoicesRepository } from './invoices.repository';
import type {
  InvoiceDetailRow,
  InvoiceItemRow,
  InvoiceListRow,
  NewInvoiceItemRow,
  NewInvoiceRow,
} from './invoices.types';

const TODAY = '2026-09-30';
const TX = { execute: jest.fn().mockResolvedValue(undefined), marker: 'tx' };

const principal: AuthPrincipal = {
  userId: 'user-1',
  sessionId: 'session-1',
  role: 'ACCOUNTANT',
  permissions: ['invoice:create', 'invoice:read'],
};

function dto(patch: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
  return {
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-09-30',
    dueDate: '2026-10-30',
    currency: 'AUD',
    customer: { fullname: 'Paul', email: 'paul@example.test' },
    items: [{ name: 'Honda RC150', quantity: 2, rate: '1000.00' }],
    ...patch,
  };
}

function detailRowFrom(invoice: NewInvoiceRow): InvoiceDetailRow {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceReference: invoice.invoiceReference ?? null,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    currencySymbol: invoice.currencySymbol,
    description: invoice.description ?? null,
    status: invoice.status,
    customerFullname: invoice.customerFullname,
    customerEmail: invoice.customerEmail,
    customerMobile: invoice.customerMobile ?? null,
    customerAddress: invoice.customerAddress ?? null,
    taxRate: invoice.taxRate,
    invoiceSubTotal: invoice.invoiceSubTotal,
    totalTax: invoice.totalTax,
    totalDiscount: invoice.totalDiscount,
    totalAmount: invoice.totalAmount,
    totalPaid: invoice.totalPaid as string,
    balanceAmount: invoice.balanceAmount,
    createdAt: new Date('2026-09-30T01:00:00.000Z'),
    createdBy: invoice.createdBy,
  };
}

function setup() {
  const repository = {
    list: jest.fn(),
    findById: jest.fn(),
    insertWithItem: jest.fn(
      (_tx: unknown, invoice: NewInvoiceRow, item: NewInvoiceItemRow) =>
        Promise.resolve({
          invoice: detailRowFrom(invoice),
          items: [
            {
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              rate: item.rate,
            },
          ] as InvoiceItemRow[],
        }),
    ),
  };
  const idempotency = {
    fingerprint: jest.fn().mockReturnValue('fingerprint'),
    begin: jest.fn().mockResolvedValue({ kind: 'new' }),
    complete: jest.fn().mockResolvedValue(undefined),
  };
  const audit = {
    record: jest
      .fn<Promise<void>, [AuditEvent, unknown?]>()
      .mockResolvedValue(undefined),
  };
  const calendar = { today: jest.fn().mockReturnValue(TODAY) };
  const db = {
    transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(TX),
    ),
  };
  const service = new InvoicesService(
    db as unknown as Database,
    repository as unknown as InvoicesRepository,
    idempotency as unknown as IdempotencyService,
    audit as unknown as AuditService,
    calendar as unknown as BusinessCalendar,
  );
  return { service, repository, idempotency, audit, db };
}

/** Shapes a database failure the way Drizzle wraps it (SQLSTATE on `cause`). */
const dbError = (code: string, constraint?: string) =>
  new Error('Failed query', {
    cause: Object.assign(new Error('pg'), { code, constraint }),
  });

describe('InvoicesService.create', () => {
  it('stores a Draft owned by the caller with server-computed totals and the currency symbol', async () => {
    const { service, repository } = setup();

    const result = await service.create(
      dto({ taxRate: '10', discount: '20' }),
      principal,
    );

    const [, invoice, item] = repository.insertWithItem.mock.calls[0];
    expect(invoice).toMatchObject({
      invoiceNumber: 'INV-1',
      status: 'Draft',
      createdBy: 'user-1',
      currencySymbol: 'AU$',
      taxRate: '10',
      invoiceSubTotal: '2000',
      totalTax: '200',
      totalDiscount: '20',
      totalAmount: '2180',
      totalPaid: '0',
      balanceAmount: '2180',
    });
    expect(item).toMatchObject({
      invoiceId: invoice.id,
      name: 'Honda RC150',
      quantity: 2,
      rate: '1000.00',
      position: 1,
    });
    expect(result).toMatchObject({ status: 201, replayed: false });
    expect(result.body).toMatchObject({
      status: 'Draft',
      totalAmount: '2180.00',
      createdBy: 'user-1',
    });
  });

  it('defaults the tax rate to 10 and the discount to 0', async () => {
    const { service, repository } = setup();
    await service.create(dto(), principal);
    const [, invoice] = repository.insertWithItem.mock.calls[0];
    expect(invoice).toMatchObject({
      taxRate: '10',
      totalTax: '200',
      totalDiscount: '0',
      totalAmount: '2200',
    });
  });

  it('uses the currency registry symbol, not a client value', async () => {
    const { service, repository } = setup();
    await service.create(dto({ currency: 'JPY' }), principal);
    expect(repository.insertWithItem.mock.calls[0][1]).toMatchObject({
      currency: 'JPY',
      currencySymbol: '¥',
    });
  });

  it('writes the INVOICE_CREATED audit event inside the same transaction', async () => {
    const { service, audit } = setup();
    const context = { requestId: 'r1', ip: '127.0.0.1', userAgent: 'jest' };

    await service.create(dto(), principal, { context });

    expect(audit.record).toHaveBeenCalledTimes(1);
    const [event, executor] = audit.record.mock.calls[0];
    expect(executor).toBe(TX);
    expect(event).toMatchObject({
      action: 'INVOICE_CREATED',
      outcome: 'SUCCESS',
      actorUserId: 'user-1',
      entityType: AUDIT_ENTITY_TYPES.INVOICE,
      metadata: {
        invoiceNumber: 'INV-1',
        totalAmount: '2200.00',
        currency: 'AUD',
      },
      context,
    });
    expect(event.entityId).toEqual(expect.any(String));
    expect(JSON.stringify(event.metadata)).not.toContain('paul@example.test');
  });

  it('sets a lock timeout inside the transaction', async () => {
    const { service } = setup();
    await service.create(dto(), principal);
    expect(TX.execute).toHaveBeenCalled();
  });

  it('turns domain rule violations into a 400 with every message and opens no transaction', async () => {
    const { service, db, idempotency } = setup();

    const failure = service.create(
      dto({
        discount: '99999999',
        items: [{ name: 'x', quantity: 1, rate: '1.00' }],
      }),
      principal,
      { idempotencyKey: 'k1' },
    );

    await expect(failure).rejects.toBeInstanceOf(BadRequestException);
    await expect(failure).rejects.toMatchObject({
      response: { message: expect.any(Array) as unknown[], statusCode: 400 },
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(idempotency.begin).not.toHaveBeenCalled();
  });

  describe('with an Idempotency-Key', () => {
    it('claims the key, creates once and stores the response', async () => {
      const { service, idempotency } = setup();

      const result = await service.create(dto(), principal, {
        idempotencyKey: 'k1',
      });

      expect(idempotency.fingerprint).toHaveBeenCalledWith(
        'POST',
        '/invoices',
        expect.objectContaining({ invoiceNumber: 'INV-1' }),
      );
      expect(idempotency.begin).toHaveBeenCalledWith(TX, {
        userId: 'user-1',
        key: 'k1',
        method: 'POST',
        path: '/invoices',
        requestHash: 'fingerprint',
      });
      expect(idempotency.complete).toHaveBeenCalledWith(
        TX,
        { userId: 'user-1', key: 'k1' },
        expect.objectContaining({ status: 201, body: result.body }),
      );
    });

    it('replays the stored response without inserting or auditing again', async () => {
      const { service, repository, idempotency, audit } = setup();
      const stored = { invoiceId: 'i1', invoiceNumber: 'INV-1' };
      idempotency.begin.mockResolvedValueOnce({
        kind: 'replay',
        response: { status: 201, body: stored },
      });

      const result = await service.create(dto(), principal, {
        idempotencyKey: 'k1',
      });

      expect(result).toEqual({ status: 201, body: stored, replayed: true });
      expect(repository.insertWithItem).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(idempotency.complete).not.toHaveBeenCalled();
    });

    it('passes the 422 for a reused key with another payload through unchanged', async () => {
      const { service, idempotency, repository } = setup();
      const mismatch = new UnprocessableEntityException('different payload');
      idempotency.begin.mockRejectedValueOnce(mismatch);

      await expect(
        service.create(dto(), principal, { idempotencyKey: 'k1' }),
      ).rejects.toBe(mismatch);
      expect(repository.insertWithItem).not.toHaveBeenCalled();
    });

    it('does not touch the idempotency store without a key', async () => {
      const { service, idempotency } = setup();
      await service.create(dto(), principal);
      expect(idempotency.fingerprint).not.toHaveBeenCalled();
      expect(idempotency.begin).not.toHaveBeenCalled();
      expect(idempotency.complete).not.toHaveBeenCalled();
    });
  });

  describe('database error mapping', () => {
    it('maps a duplicate on the case-insensitive invoice number index to 409', async () => {
      const { service, repository } = setup();
      repository.insertWithItem.mockRejectedValueOnce(
        dbError('23505', INVOICE_NUMBER_UNIQUE_INDEX),
      );

      const failure = service.create(dto(), principal);
      await expect(failure).rejects.toBeInstanceOf(ConflictException);
      await expect(failure).rejects.toMatchObject({
        message: DUPLICATE_INVOICE_NUMBER,
      });
    });

    it('does not call a unique violation on another constraint a duplicate number', async () => {
      const { service, repository } = setup();
      const other = dbError('23505', 'some_other_key');
      repository.insertWithItem.mockRejectedValueOnce(other);

      await expect(service.create(dto(), principal)).rejects.toBe(other);
    });

    it('maps a lock timeout with a key to "request in progress"', async () => {
      const { service, idempotency } = setup();
      idempotency.begin.mockRejectedValueOnce(dbError('55P03'));

      const failure = service.create(dto(), principal, {
        idempotencyKey: 'k1',
      });
      await expect(failure).rejects.toBeInstanceOf(ConflictException);
      await expect(failure).rejects.toMatchObject({
        message: IDEMPOTENCY_IN_PROGRESS,
      });
    });

    it('maps a lock timeout without a key to a generic conflict', async () => {
      const { service, repository } = setup();
      repository.insertWithItem.mockRejectedValueOnce(dbError('55P03'));

      await expect(service.create(dto(), principal)).rejects.toMatchObject({
        message: CONFLICTING_REQUEST_IN_PROGRESS,
      });
    });

    it('rethrows unknown failures untouched so the global filter returns a generic 500', async () => {
      const { service, repository } = setup();
      const boom = new Error('connection lost');
      repository.insertWithItem.mockRejectedValueOnce(boom);

      await expect(service.create(dto(), principal)).rejects.toBe(boom);
    });

    it('fails the whole create when the audit write fails (no invoice without its audit row)', async () => {
      const { service, audit } = setup();
      const boom = new Error('audit down');
      audit.record.mockRejectedValueOnce(boom);

      await expect(service.create(dto(), principal)).rejects.toBe(boom);
    });
  });
});

describe('InvoicesService.get', () => {
  it('throws 404 when the invoice does not exist', async () => {
    const { service, repository } = setup();
    repository.findById.mockResolvedValueOnce(undefined);
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('derives the status from the business date', async () => {
    const { service, repository } = setup();
    const created = await setup().repository.insertWithItem(
      TX,
      {
        ...({} as NewInvoiceRow),
        id: 'i1',
        invoiceNumber: 'INV-1',
        invoiceDate: '2026-01-01',
        dueDate: '2026-02-01',
        currency: 'AUD',
        currencySymbol: 'AU$',
        status: 'Pending',
        customerFullname: 'P',
        customerEmail: 'p@e.test',
        taxRate: '10',
        invoiceSubTotal: '1',
        totalTax: '0.1',
        totalDiscount: '0',
        totalAmount: '1.1',
        totalPaid: '0',
        balanceAmount: '1.1',
        createdBy: 'u',
      },
      {
        id: 'it1',
        invoiceId: 'i1',
        name: 'n',
        quantity: 1,
        rate: '1.00',
        position: 1,
      },
    );
    repository.findById.mockResolvedValueOnce(created);

    await expect(service.get('i1')).resolves.toMatchObject({
      invoiceId: 'i1',
      status: 'Overdue',
    });
  });
});

describe('InvoicesService.list', () => {
  const query = (
    patch: Partial<ListInvoicesQueryDto> = {},
  ): ListInvoicesQueryDto => ({
    page: 2,
    pageSize: 5,
    sortBy: 'totalAmount',
    ordering: 'ASC',
    ...patch,
  });

  it('passes the business date and query to the repository and shapes the page', async () => {
    const { service, repository } = setup();
    const row: InvoiceListRow = {
      id: 'i1',
      invoiceNumber: 'INV-1',
      customerFullname: 'Paul',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      currency: 'AUD',
      currencySymbol: 'AU$',
      totalAmount: '2200.0000',
      balanceAmount: '2200.0000',
      status: 'Pending',
    };
    repository.list.mockResolvedValueOnce({ rows: [row], total: 11 });

    const result = await service.list(
      query({ keyword: 'paul', status: 'Overdue' }),
    );

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'paul',
        status: 'Overdue',
        page: 2,
        pageSize: 5,
        sortBy: 'totalAmount',
        ordering: 'ASC',
        today: TODAY,
      }),
      {},
    );
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          invoiceId: 'i1',
          customerName: 'Paul',
          status: 'Overdue',
          totalAmount: '2200.00',
        }),
      ],
      paging: { page: 2, pageSize: 5, total: 11 },
    });
  });

  it('reports the real total for a page beyond the end', async () => {
    const { service, repository } = setup();
    repository.list.mockResolvedValueOnce({ rows: [], total: 3 });
    await expect(service.list(query({ page: 99 }))).resolves.toEqual({
      data: [],
      paging: { page: 99, pageSize: 5, total: 3 },
    });
  });
});
