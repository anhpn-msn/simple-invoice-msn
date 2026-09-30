import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { CreateInvoiceDto } from './create-invoice.dto';

const pipe = createValidationPipe();

const validBody = (): Record<string, unknown> => ({
  invoiceNumber: 'IV-2026-0001',
  invoiceReference: 'PO-7781',
  invoiceDate: '2026-09-30',
  dueDate: '2026-10-30',
  currency: 'AUD',
  description: 'Consulting',
  customer: {
    fullname: 'Jane Doe',
    email: 'jane@example.com',
    mobileNumber: '+61 400 000 000',
    address: 'Sydney',
  },
  items: [{ name: 'Consulting hours', quantity: 10, rate: '150.00' }],
  taxRate: '10',
  discount: '0',
});

async function parse(body: unknown): Promise<CreateInvoiceDto> {
  return (await pipe.transform(body, {
    type: 'body',
    metatype: CreateInvoiceDto,
  })) as CreateInvoiceDto;
}

async function messagesFor(body: unknown): Promise<string[]> {
  try {
    await parse(body);
  } catch (error) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse() as { message: string[] };
      return response.message;
    }
    throw error;
  }
  return [];
}

const withOverride = (
  patch: Record<string, unknown>,
): Record<string, unknown> => ({ ...validBody(), ...patch });

const withItem = (patch: Record<string, unknown>): Record<string, unknown> => ({
  ...validBody(),
  items: [{ ...(validBody().items as object[])[0], ...patch }],
});

const withCustomer = (
  patch: Record<string, unknown>,
): Record<string, unknown> => ({
  ...validBody(),
  customer: { ...(validBody().customer as object), ...patch },
});

describe('CreateInvoiceDto', () => {
  it('accepts the SPEC 6.7 example', async () => {
    await expect(messagesFor(validBody())).resolves.toEqual([]);
  });

  it('accepts a minimal body and leaves optional fields undefined', async () => {
    const dto = await parse({
      invoiceNumber: 'A1',
      invoiceDate: '2026-09-30',
      dueDate: '2026-09-30',
      currency: 'JPY',
      customer: { fullname: 'X', email: 'x@example.com' },
      items: [{ name: 'Item', quantity: 1, rate: '1' }],
    });
    expect(dto.taxRate).toBeUndefined();
    expect(dto.discount).toBeUndefined();
    expect(dto.invoiceReference).toBeUndefined();
    expect(dto.customer.mobileNumber).toBeUndefined();
  });

  describe('unknown and server-owned fields', () => {
    it.each([
      'status',
      'createdBy',
      'totalAmount',
      'currencySymbol',
      'id',
      'balanceAmount',
    ])('rejects %s', async (field) => {
      const messages = await messagesFor(withOverride({ [field]: 'x' }));
      expect(messages).toContain(`property ${field} should not exist`);
    });

    it('rejects unknown properties inside nested objects', async () => {
      const customer = await messagesFor(withCustomer({ vip: true }));
      expect(customer.join()).toMatch(/vip should not exist/);
      const item = await messagesFor(withItem({ total: '5' }));
      expect(item.join()).toMatch(/total should not exist/);
    });
  });

  describe('invoiceNumber', () => {
    it('is trimmed before validation', async () => {
      const dto = await parse(withOverride({ invoiceNumber: '  IV-1  ' }));
      expect(dto.invoiceNumber).toBe('IV-1');
    });

    it.each(['', '   ', '-abc', 'IV 1', 'IV$1', 'a'.repeat(51), 'IV\n1'])(
      'rejects %j',
      async (value) => {
        expect(
          (await messagesFor(withOverride({ invoiceNumber: value }))).length,
        ).toBeGreaterThan(0);
      },
    );

    it('accepts every allowed punctuation and 50 characters', async () => {
      await expect(
        messagesFor(withOverride({ invoiceNumber: 'A-b_c/d.e#1' })),
      ).resolves.toEqual([]);
      await expect(
        messagesFor(withOverride({ invoiceNumber: 'a'.repeat(50) })),
      ).resolves.toEqual([]);
    });

    it('rejects a non-string', async () => {
      expect(
        (await messagesFor(withOverride({ invoiceNumber: 12345 }))).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('dates', () => {
    it('produces exactly the SPEC message when dueDate precedes invoiceDate', async () => {
      const messages = await messagesFor(
        withOverride({ invoiceDate: '2026-10-30', dueDate: '2026-10-29' }),
      );
      expect(messages).toEqual(['dueDate must be on or after invoiceDate']);
    });

    it('accepts dueDate equal to invoiceDate', async () => {
      await expect(
        messagesFor(
          withOverride({ invoiceDate: '2026-10-30', dueDate: '2026-10-30' }),
        ),
      ).resolves.toEqual([]);
    });

    it.each([
      '2026-02-30',
      '2026-13-01',
      '30-09-2026',
      '2026-9-3',
      '2026-09-30T00:00:00Z',
      '',
      20260930,
    ])(
      'rejects invoiceDate %j with one format message (no duplicate due date noise)',
      async (value) => {
        const messages = await messagesFor(
          withOverride({ invoiceDate: value }),
        );
        expect(messages).toEqual([
          'invoiceDate must be a real date in YYYY-MM-DD format',
        ]);
      },
    );

    it('rejects a missing dueDate', async () => {
      const body = validBody();
      delete body.dueDate;
      expect(await messagesFor(body)).toEqual([
        'dueDate must be a real date in YYYY-MM-DD format',
      ]);
    });
  });

  describe('currency', () => {
    it.each(['XXX', 'aud', 'AUDD', '', null])('rejects %j', async (value) => {
      const messages = await messagesFor(withOverride({ currency: value }));
      expect(messages).toEqual([
        'currency must be one of: AUD, USD, GBP, EUR, SGD, JPY, VND',
      ]);
    });

    it.each(['AUD', 'USD', 'GBP', 'EUR', 'SGD', 'JPY', 'VND'])(
      'accepts %s',
      async (code) => {
        await expect(
          messagesFor(withOverride({ currency: code })),
        ).resolves.toEqual([]);
      },
    );
  });

  describe('customer', () => {
    it('lowercases and trims the email', async () => {
      const dto = await parse(
        withCustomer({ email: '  Jane.Doe@Example.COM ' }),
      );
      expect(dto.customer.email).toBe('jane.doe@example.com');
    });

    it.each(['not-an-email', '', 'a@', '@b.com'])(
      'rejects email %j',
      async (email) => {
        const messages = await messagesFor(withCustomer({ email }));
        expect(messages.join()).toMatch(/customer\.email/);
      },
    );

    it('rejects an email over 254 characters', async () => {
      const email = `${'a'.repeat(250)}@example.com`;
      expect((await messagesFor(withCustomer({ email }))).join()).toMatch(
        /customer\.email/,
      );
    });

    it('requires fullname (1 to 200, trimmed)', async () => {
      expect(
        (await messagesFor(withCustomer({ fullname: '   ' }))).join(),
      ).toMatch(/customer\.fullname/);
      expect(
        (await messagesFor(withCustomer({ fullname: 'x'.repeat(201) }))).join(),
      ).toMatch(/customer\.fullname/);
      await expect(
        messagesFor(withCustomer({ fullname: 'x'.repeat(200) })),
      ).resolves.toEqual([]);
    });

    it.each([
      '12345',
      'abc12345',
      '+61-400-000-000-00000000000000000',
      '++61400000',
    ])('rejects mobileNumber %j', async (mobileNumber) => {
      expect(
        (await messagesFor(withCustomer({ mobileNumber }))).join(),
      ).toMatch(/customer\.mobileNumber/);
    });

    it.each(['+61 400 000 000', '(02) 9999-0000', '947717364111'])(
      'accepts mobileNumber %j',
      async (mobileNumber) => {
        await expect(
          messagesFor(withCustomer({ mobileNumber })),
        ).resolves.toEqual([]);
      },
    );

    it('treats empty optional strings as not provided', async () => {
      const dto = await parse(
        withCustomer({ mobileNumber: '  ', address: '' }),
      );
      expect(dto.customer.mobileNumber).toBeUndefined();
      expect(dto.customer.address).toBeUndefined();
    });

    it('caps address at 500 characters', async () => {
      expect(
        (await messagesFor(withCustomer({ address: 'x'.repeat(501) }))).join(),
      ).toMatch(/customer\.address/);
    });

    it('requires the customer object', async () => {
      const body = validBody();
      delete body.customer;
      expect((await messagesFor(body)).length).toBeGreaterThan(0);
      expect(
        (await messagesFor(withOverride({ customer: 'Jane' }))).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('optional text fields', () => {
    it('caps invoiceReference at 100 and description at 1000', async () => {
      expect(
        (await messagesFor(withOverride({ invoiceReference: 'x'.repeat(101) })))
          .length,
      ).toBe(1);
      expect(
        (await messagesFor(withOverride({ description: 'x'.repeat(1001) })))
          .length,
      ).toBe(1);
      await expect(
        messagesFor(
          withOverride({
            invoiceReference: 'x'.repeat(100),
            description: 'x'.repeat(1000),
          }),
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('items', () => {
    it('requires exactly one item', async () => {
      const item = (validBody().items as object[])[0];
      expect(await messagesFor(withOverride({ items: [] }))).toEqual([
        'items must contain exactly 1 item',
      ]);
      expect(await messagesFor(withOverride({ items: [item, item] }))).toEqual([
        'items must contain exactly 1 item',
      ]);
      expect(
        (await messagesFor(withOverride({ items: 'x' }))).length,
      ).toBeGreaterThan(0);
    });

    it('validates the name', async () => {
      expect((await messagesFor(withItem({ name: '  ' }))).join()).toMatch(
        /items\.0\.name/,
      );
      expect(
        (await messagesFor(withItem({ name: 'x'.repeat(201) }))).join(),
      ).toMatch(/items\.0\.name/);
    });

    it.each([0, -1, 1.5, 100001, '5', null])(
      'rejects quantity %j',
      async (quantity) => {
        expect((await messagesFor(withItem({ quantity }))).join()).toMatch(
          /items\.0\.quantity/,
        );
      },
    );

    it.each([1, 100000])('accepts quantity %j', async (quantity) => {
      await expect(messagesFor(withItem({ quantity }))).resolves.toEqual([]);
    });

    it.each([
      [150, 'a JSON number (money is never a number)'],
      ['0', 'zero'],
      ['0.0000', 'zero with decimals'],
      ['-5', 'negative'],
      ['1.23456', 'more than 4 decimals'],
      ['1e3', 'exponent'],
      [' 5', 'whitespace'],
      ['1,000', 'separator'],
      ['1000000000.0000', 'above the maximum'],
      ['1'.repeat(16), 'more than 15 integer digits'],
      ['', 'empty'],
    ])('rejects rate %j (%s)', async (...[rate]) => {
      expect((await messagesFor(withItem({ rate }))).join()).toMatch(
        /items\.0\.rate/,
      );
    });

    it.each(['0.0001', '1', '999999999.9999', '150.00', '0.3333'])(
      'accepts rate %j',
      async (...[rate]) => {
        await expect(messagesFor(withItem({ rate }))).resolves.toEqual([]);
      },
    );
  });

  describe('taxRate and discount', () => {
    it.each(['0', '10', '100', '7.5', '20.00', '0.01'])(
      'accepts taxRate %j',
      async (taxRate) => {
        await expect(messagesFor(withOverride({ taxRate }))).resolves.toEqual(
          [],
        );
      },
    );

    it.each(['100.01', '101', '-1', '10.123', 10, 'abc', '1e1'])(
      'rejects taxRate %j',
      async (taxRate) => {
        expect((await messagesFor(withOverride({ taxRate }))).join()).toMatch(
          /taxRate/,
        );
      },
    );

    it.each(['0', '20', '0.5', '19.99'])(
      'accepts discount %j',
      async (discount) => {
        await expect(messagesFor(withOverride({ discount }))).resolves.toEqual(
          [],
        );
      },
    );

    it.each(['-1', 20, '1.23456', 'abc'])(
      'rejects discount %j',
      async (discount) => {
        expect((await messagesFor(withOverride({ discount }))).join()).toMatch(
          /discount/,
        );
      },
    );
  });

  it('collects every violated rule in one response', async () => {
    const messages = await messagesFor(
      withOverride({ invoiceNumber: '', currency: 'XXX', dueDate: 'nope' }),
    );
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });
});
