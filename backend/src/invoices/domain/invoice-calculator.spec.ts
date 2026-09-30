import { calculateInvoiceTotals } from './invoice-calculator';
import type { InvoiceCalculationInput } from './invoice.types';
import { DomainValidationError } from './errors';
import { Dec, formatAmount } from './money';

const base: InvoiceCalculationInput = {
  quantity: 1,
  rate: '100',
  taxRate: '10',
  discount: '0',
  currency: 'AUD',
  totalPaid: '0',
};

function calc(overrides: Partial<InvoiceCalculationInput>) {
  return calculateInvoiceTotals({ ...base, ...overrides });
}

function messagesOf(overrides: Partial<InvoiceCalculationInput>): string[] {
  try {
    calc(overrides);
  } catch (error) {
    if (error instanceof DomainValidationError) return error.messages;
    throw error;
  }
  throw new Error('expected DomainValidationError');
}

describe('calculateInvoiceTotals', () => {
  it('reproduces the Appendix A example', () => {
    const totals = calculateInvoiceTotals({
      quantity: 2,
      rate: '1000',
      taxRate: '10',
      discount: '20',
      currency: 'AUD',
      totalPaid: '1451.34',
    });
    expect(formatAmount(totals.subTotal, 'AUD')).toBe('2000.00');
    expect(formatAmount(totals.taxAmount, 'AUD')).toBe('200.00');
    expect(formatAmount(totals.discount, 'AUD')).toBe('20.00');
    expect(formatAmount(totals.totalAmount, 'AUD')).toBe('2180.00');
    expect(formatAmount(totals.totalPaid, 'AUD')).toBe('1451.34');
    expect(formatAmount(totals.balanceAmount, 'AUD')).toBe('728.66');
  });

  it('applies defaults: tax 10, discount 0, totalPaid 0', () => {
    const totals = calculateInvoiceTotals({
      quantity: 1,
      rate: '100',
      currency: 'AUD',
    });
    expect(totals.taxAmount.toFixed()).toBe('10');
    expect(totals.discount.toFixed()).toBe('0');
    expect(totals.totalPaid.toFixed()).toBe('0');
    expect(totals.balanceAmount.toFixed()).toBe('110');
  });

  it('accepts Decimal inputs (values read back from storage)', () => {
    const totals = calc({
      rate: new Dec('1000'),
      taxRate: new Dec('10.0000'),
      discount: new Dec('20.00'),
      totalPaid: new Dec('1451.3400'),
      quantity: 2,
    });
    expect(totals.balanceAmount.toFixed(2)).toBe('728.66');
  });

  describe('rounding', () => {
    it('rounds subTotal once: 3 x 0.3333 = 0.9999 -> 1.00, tax 0.10, total 1.10', () => {
      const totals = calc({ quantity: 3, rate: '0.3333' });
      expect(formatAmount(totals.subTotal, 'AUD')).toBe('1.00');
      expect(formatAmount(totals.taxAmount, 'AUD')).toBe('0.10');
      expect(formatAmount(totals.totalAmount, 'AUD')).toBe('1.10');
    });

    it('computes tax from the rounded subTotal, not the raw product', () => {
      const totals = calc({ quantity: 3, rate: '0.3333', taxRate: '50' });
      expect(totals.taxAmount.toFixed(2)).toBe('0.50');
    });

    it('rounds half up at exactly .005: sub 0.05 at 10% -> tax 0.005 -> 0.01', () => {
      const totals = calc({ quantity: 1, rate: '0.05' });
      expect(totals.subTotal.toFixed(2)).toBe('0.05');
      expect(totals.taxAmount.toFixed(2)).toBe('0.01');
      expect(totals.totalAmount.toFixed(2)).toBe('0.06');
    });

    it('rounds just below the half down: sub 0.04 at 10% -> 0.004 -> 0.00', () => {
      const totals = calc({ quantity: 1, rate: '0.04' });
      expect(totals.taxAmount.toFixed(2)).toBe('0.00');
    });

    it('rounds subTotal half up at exactly .005', () => {
      expect(calc({ quantity: 1, rate: '0.005' }).subTotal.toFixed(2)).toBe(
        '0.01',
      );
      expect(calc({ quantity: 5, rate: '0.001' }).subTotal.toFixed(2)).toBe(
        '0.01',
      );
      expect(calc({ quantity: 1, rate: '1.0049' }).subTotal.toFixed(2)).toBe(
        '1.00',
      );
    });

    it('JPY has zero decimals: rate 999.5 x 1 -> 1000', () => {
      const totals = calc({
        currency: 'JPY',
        quantity: 1,
        rate: '999.5',
        taxRate: '0',
      });
      expect(formatAmount(totals.subTotal, 'JPY')).toBe('1000');
      expect(formatAmount(totals.totalAmount, 'JPY')).toBe('1000');
    });

    it('JPY rounds tax to whole yen half up: sub 5 at 10% -> 0.5 -> 1', () => {
      const totals = calc({ currency: 'JPY', rate: '5' });
      expect(totals.taxAmount.toFixed()).toBe('1');
      expect(totals.totalAmount.toFixed()).toBe('6');
    });

    it('VND has zero decimals', () => {
      const totals = calc({ currency: 'VND', quantity: 3, rate: '33333.3333' });
      expect(formatAmount(totals.subTotal, 'VND')).toBe('100000');
      expect(formatAmount(totals.taxAmount, 'VND')).toBe('10000');
      expect(formatAmount(totals.totalAmount, 'VND')).toBe('110000');
    });
  });

  describe('tax rate', () => {
    it('tax 0 gives no tax', () => {
      const totals = calc({ taxRate: '0' });
      expect(totals.taxAmount.toFixed(2)).toBe('0.00');
      expect(totals.totalAmount.toFixed(2)).toBe('100.00');
    });

    it('tax 100 doubles the subTotal', () => {
      const totals = calc({ taxRate: '100' });
      expect(totals.taxAmount.toFixed(2)).toBe('100.00');
      expect(totals.totalAmount.toFixed(2)).toBe('200.00');
    });

    it('supports two decimals (8.88 percent)', () => {
      const totals = calc({ rate: '100', taxRate: '8.88' });
      expect(totals.taxAmount.toFixed(2)).toBe('8.88');
    });

    it.each(['100.01', '101', '-1', '5.555', '1e1', ''])(
      'rejects taxRate %j',
      (taxRate) => {
        expect(() => calc({ taxRate })).toThrow(DomainValidationError);
      },
    );
  });

  describe('discount', () => {
    it('allows discount equal to subTotal (tax stays payable)', () => {
      const totals = calc({ discount: '100' });
      expect(totals.totalAmount.toFixed(2)).toBe('10.00');
    });

    it('rejects discount above subTotal with the specified message', () => {
      expect(messagesOf({ discount: '100.01' })).toEqual([
        'discount must not exceed subTotal',
      ]);
    });

    it('compares against the rounded subTotal', () => {
      expect(() =>
        calc({ quantity: 3, rate: '0.3333', discount: '1.00' }),
      ).not.toThrow();
      expect(() =>
        calc({ quantity: 3, rate: '0.3333', discount: '1.01' }),
      ).toThrow('discount must not exceed subTotal');
    });

    it('rejects a discount with 3 decimals in AUD', () => {
      expect(messagesOf({ discount: '1.005' })).toEqual([
        'discount must have at most 2 decimal places for AUD',
      ]);
    });

    it('rejects fractional discount in JPY and VND', () => {
      expect(() =>
        calc({ currency: 'JPY', rate: '1000', discount: '0.5' }),
      ).toThrow('discount must have at most 0 decimal places for JPY');
      expect(() =>
        calc({ currency: 'VND', rate: '1000', discount: '10.5' }),
      ).toThrow(DomainValidationError);
    });

    it('accepts whole-number discount in JPY and a zero-padded whole value', () => {
      expect(
        calc({
          currency: 'JPY',
          rate: '1000',
          discount: '100',
        }).discount.toFixed(),
      ).toBe('100');
      expect(
        calc({
          currency: 'JPY',
          rate: '1000',
          discount: '100.0',
        }).discount.toFixed(),
      ).toBe('100');
    });

    it.each(['-1', '1e2', ' 1', '', 'abc'])(
      'rejects malformed discount %j',
      (discount) => {
        expect(() => calc({ discount })).toThrow(DomainValidationError);
      },
    );
  });

  describe('quantity', () => {
    it.each([0, -1, 1.5, 100001, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects quantity %p',
      (quantity) => {
        expect(messagesOf({ quantity })).toEqual([
          'quantity must be an integer between 1 and 100000',
        ]);
      },
    );

    it('rejects a non-number quantity at runtime', () => {
      expect(() => calc({ quantity: '2' as unknown as number })).toThrow(
        DomainValidationError,
      );
    });

    it('accepts the bounds 1 and 100000', () => {
      expect(() => calc({ quantity: 1 })).not.toThrow();
      expect(() => calc({ quantity: 100000 })).not.toThrow();
    });
  });

  describe('rate', () => {
    it.each([
      '1e3',
      '-1',
      ' 1',
      '1.23456',
      '',
      'abc',
      '0',
      '0.0000',
      '1000000000',
      '999999999.99991',
    ])('rejects rate %j', (rate) => {
      expect(() => calc({ rate })).toThrow(DomainValidationError);
    });

    it('accepts the smallest and largest rate', () => {
      expect(() => calc({ rate: '0.0001' })).not.toThrow();
      expect(() => calc({ rate: '999999999.9999' })).not.toThrow();
    });

    it('reports the upper bound message', () => {
      expect(messagesOf({ rate: '1000000000' })).toEqual([
        'rate must not exceed 999999999.9999',
      ]);
    });

    it('rejects a negative Decimal rate', () => {
      expect(() => calc({ rate: new Dec('-5') })).toThrow(
        DomainValidationError,
      );
    });
  });

  describe('totalPaid and balance', () => {
    it('balance is total minus paid', () => {
      const totals = calc({ totalPaid: '60.5' });
      expect(totals.balanceAmount.toFixed(2)).toBe('49.50');
    });

    it('allows totalPaid equal to totalAmount (balance 0)', () => {
      const totals = calc({ totalPaid: '110' });
      expect(totals.balanceAmount.toFixed(2)).toBe('0.00');
    });

    it('rejects totalPaid above totalAmount', () => {
      expect(messagesOf({ totalPaid: '110.01' })).toEqual([
        'totalPaid must not exceed totalAmount',
      ]);
    });

    it('rejects totalPaid with more decimals than the currency', () => {
      expect(() => calc({ totalPaid: '1.001' })).toThrow(DomainValidationError);
    });
  });

  describe('large values', () => {
    it('keeps full precision for the maximum inputs and fits NUMERIC(19,4)', () => {
      const totals = calc({
        quantity: 100000,
        rate: '999999999.9999',
        taxRate: '100',
      });
      expect(totals.subTotal.toFixed(2)).toBe('99999999999990.00');
      expect(totals.taxAmount.toFixed(2)).toBe('99999999999990.00');
      expect(totals.totalAmount.toFixed(2)).toBe('199999999999980.00');
      for (const value of [
        totals.subTotal,
        totals.taxAmount,
        totals.totalAmount,
        totals.balanceAmount,
      ]) {
        const [integerPart] = value.toFixed().split('.');
        expect(integerPart.length).toBeLessThanOrEqual(15);
        expect(value.decimalPlaces()).toBeLessThanOrEqual(4);
      }
    });

    it('matches an exact BigInt oracle where a JS number would drift', () => {
      const quantity = 99999;
      const rateScaled = 123456789_1234n;
      const product = rateScaled * BigInt(quantity);
      const cents = (product + 50n) / 100n;
      const expected = `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
      const totals = calc({ quantity, rate: '123456789.1234', taxRate: '0' });
      expect(totals.subTotal.toFixed(2)).toBe(expected);
      expect(Number((cents / 100n).toString())).toBeGreaterThan(2 ** 43);
    });

    it('JPY at the maximum stays exact', () => {
      const totals = calc({
        currency: 'JPY',
        quantity: 100000,
        rate: '999999999.9999',
        taxRate: '100',
      });
      expect(totals.subTotal.toFixed()).toBe('99999999999990');
      expect(totals.totalAmount.toFixed()).toBe('199999999999980');
    });
  });

  it('rejects an unsupported currency', () => {
    expect(() => calc({ currency: 'KWD' })).toThrow(DomainValidationError);
  });

  it('reports every violated field at once', () => {
    const messages = messagesOf({ quantity: 0, rate: '0', taxRate: '101' });
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatch(/^quantity/);
    expect(messages[1]).toMatch(/^rate/);
    expect(messages[2]).toMatch(/^taxRate/);
  });

  it('exposes the error messages array and name', () => {
    const error = new DomainValidationError(['a', 'b']);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainValidationError');
    expect(error.messages).toEqual(['a', 'b']);
    expect(error.message).toBe('a; b');
  });
});
