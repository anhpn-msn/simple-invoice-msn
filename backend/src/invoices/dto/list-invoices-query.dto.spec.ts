import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { ListInvoicesQueryDto } from './list-invoices-query.dto';

const pipe = createValidationPipe();

async function parse(
  query: Record<string, unknown>,
): Promise<ListInvoicesQueryDto> {
  return (await pipe.transform(query, {
    type: 'query',
    metatype: ListInvoicesQueryDto,
  })) as ListInvoicesQueryDto;
}

async function messagesFor(query: Record<string, unknown>): Promise<string[]> {
  try {
    await parse(query);
  } catch (error) {
    if (error instanceof BadRequestException) {
      return (error.getResponse() as { message: string[] }).message;
    }
    throw error;
  }
  return [];
}

describe('ListInvoicesQueryDto', () => {
  it('applies the SPEC defaults', async () => {
    const dto = await parse({});
    expect(dto).toMatchObject({
      page: 1,
      pageSize: 10,
      sortBy: 'invoiceDate',
      ordering: 'DESC',
    });
    expect(dto.status).toBeUndefined();
    expect(dto.keyword).toBeUndefined();
  });

  it('converts numeric strings and accepts every filter', async () => {
    const dto = await parse({
      page: '3',
      pageSize: '50',
      sortBy: 'totalAmount',
      ordering: 'asc',
      status: 'Overdue',
      keyword: '  acme  ',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    expect(dto).toMatchObject({
      page: 3,
      pageSize: 50,
      sortBy: 'totalAmount',
      ordering: 'ASC',
      status: 'Overdue',
      keyword: 'acme',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
  });

  describe('paging bounds', () => {
    it.each([
      { pageSize: '101' },
      { pageSize: '0' },
      { pageSize: '-1' },
      { page: '0' },
      { page: '100001' },
    ])('rejects %j', async (query) => {
      expect((await messagesFor(query)).length).toBeGreaterThan(0);
    });

    it('accepts the upper bounds', async () => {
      await expect(
        messagesFor({ page: '100000', pageSize: '100' }),
      ).resolves.toEqual([]);
    });

    it.each(['1e2', '1.5', ' 5', 'abc', '', '5abc', '99999999999'])(
      'rejects non-integer page %j',
      async (page) => {
        expect((await messagesFor({ page })).length).toBeGreaterThan(0);
      },
    );

    it('rejects a repeated parameter (array value)', async () => {
      expect((await messagesFor({ page: ['1', '2'] })).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('ordering', () => {
    it.each([
      ['asc', 'ASC'],
      ['Desc', 'DESC'],
      ['ASC', 'ASC'],
    ])('accepts %s case-insensitively', async (input, expected) => {
      expect((await parse({ ordering: input })).ordering).toBe(expected);
    });

    it('rejects anything else', async () => {
      expect((await messagesFor({ ordering: 'sideways' })).length).toBe(1);
    });
  });

  describe('sortBy and status are whitelists', () => {
    it.each([
      'id',
      'invoice_date',
      'createdAt',
      'totalAmount; DROP TABLE invoices',
      'invoicedate',
    ])('rejects sortBy %j', async (sortBy) => {
      expect((await messagesFor({ sortBy })).length).toBe(1);
    });

    it.each(['overdue', 'Cancelled', 'PAID', ''])(
      'rejects status %j',
      async (status) => {
        expect((await messagesFor({ status })).length).toBe(1);
      },
    );

    it.each(['Draft', 'Pending', 'Paid', 'Overdue'])(
      'accepts status %s',
      async (status) => {
        await expect(messagesFor({ status })).resolves.toEqual([]);
      },
    );
  });

  describe('keyword', () => {
    it('rejects empty and whitespace-only values', async () => {
      expect((await messagesFor({ keyword: '' })).length).toBeGreaterThan(0);
      expect((await messagesFor({ keyword: '   ' })).length).toBeGreaterThan(0);
    });

    it('caps the length at 100 after trimming', async () => {
      await expect(
        messagesFor({ keyword: ` ${'a'.repeat(100)} ` }),
      ).resolves.toEqual([]);
      expect(
        (await messagesFor({ keyword: 'a'.repeat(101) })).length,
      ).toBeGreaterThan(0);
    });

    it('keeps LIKE metacharacters untouched (escaping happens at query time)', async () => {
      expect((await parse({ keyword: '50%_\\' })).keyword).toBe('50%_\\');
    });
  });

  describe('dates', () => {
    it('rejects fromDate after toDate', async () => {
      expect(
        await messagesFor({ fromDate: '2026-10-02', toDate: '2026-10-01' }),
      ).toEqual(['toDate must be on or after fromDate']);
    });

    it('accepts fromDate equal to toDate and a single bound', async () => {
      await expect(
        messagesFor({ fromDate: '2026-10-01', toDate: '2026-10-01' }),
      ).resolves.toEqual([]);
      await expect(messagesFor({ toDate: '2026-10-01' })).resolves.toEqual([]);
    });

    it.each(['2026-02-30', '2026/01/01', '01-01-2026', 'today'])(
      'rejects fromDate %j',
      async (fromDate) => {
        expect(await messagesFor({ fromDate })).toEqual([
          'fromDate must be a real date in YYYY-MM-DD format',
        ]);
      },
    );
  });

  it('rejects unknown query parameters', async () => {
    expect(await messagesFor({ sort: 'x' })).toContain(
      'property sort should not exist',
    );
  });
});
