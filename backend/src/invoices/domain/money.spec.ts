import { DomainValidationError } from './errors';
import {
  Dec,
  formatAmount,
  formatPercent,
  formatRate,
  parseDecimalString,
  roundToCurrency,
} from './money';

const opts = { maxDecimals: 4, allowZero: true };

describe('parseDecimalString', () => {
  it.each([
    '0',
    '1',
    '10',
    '10.5',
    '0.3333',
    '999999999999999',
    '123456789012345.1234',
  ])('accepts %s', (input) => {
    expect(parseDecimalString(input, opts).toFixed()).toBe(
      new Dec(input).toFixed(),
    );
  });

  it.each([
    ['exponent', '1e3'],
    ['negative', '-1'],
    ['plus sign', '+1'],
    ['leading space', ' 1'],
    ['trailing space', '1 '],
    ['too many decimals', '1.23456'],
    ['empty', ''],
    ['letters', 'abc'],
    ['comma separator', '1,5'],
    ['trailing dot', '1.'],
    ['leading dot', '.5'],
    ['16 integer digits', '1234567890123456'],
    ['newline', '1\n'],
  ])('rejects %s (%j)', (_label, input) => {
    expect(() => parseDecimalString(input, opts)).toThrow(
      DomainValidationError,
    );
  });

  it('rejects non-string input at runtime', () => {
    expect(() => parseDecimalString(5 as unknown as string, opts)).toThrow(
      DomainValidationError,
    );
  });

  it('enforces maxDecimals per field', () => {
    expect(() =>
      parseDecimalString('1.234', { maxDecimals: 2, allowZero: true }),
    ).toThrow('at most 2 decimal places');
    expect(
      parseDecimalString('1.23', { maxDecimals: 2, allowZero: true }).toFixed(),
    ).toBe('1.23');
  });

  it('rejects zero when allowZero is false, including "0.00"', () => {
    expect(() =>
      parseDecimalString('0', { maxDecimals: 4, allowZero: false }),
    ).toThrow('greater than 0');
    expect(() =>
      parseDecimalString('0.00', { maxDecimals: 4, allowZero: false }),
    ).toThrow(DomainValidationError);
  });

  it('uses the field name in messages', () => {
    expect(() => parseDecimalString('x', { ...opts, field: 'rate' })).toThrow(
      /^rate must be/,
    );
  });
});

describe('roundToCurrency', () => {
  it('rounds half up to two decimals', () => {
    expect(roundToCurrency(new Dec('0.005'), 'AUD').toFixed()).toBe('0.01');
    expect(roundToCurrency(new Dec('0.004'), 'AUD').toFixed()).toBe('0');
    expect(roundToCurrency(new Dec('1.005'), 'USD').toFixed()).toBe('1.01');
    expect(roundToCurrency(new Dec('2.675'), 'EUR').toFixed()).toBe('2.68');
  });

  it('rounds half up to zero decimals for JPY and VND', () => {
    expect(roundToCurrency(new Dec('999.5'), 'JPY').toFixed()).toBe('1000');
    expect(roundToCurrency(new Dec('999.49'), 'JPY').toFixed()).toBe('999');
    expect(roundToCurrency(new Dec('0.5'), 'VND').toFixed()).toBe('1');
  });

  it('does not mutate its input', () => {
    const value = new Dec('1.005');
    roundToCurrency(value, 'AUD');
    expect(value.toFixed()).toBe('1.005');
  });

  it('throws for unknown currency', () => {
    expect(() => roundToCurrency(new Dec(1), 'XYZ')).toThrow(
      DomainValidationError,
    );
  });
});

describe('formatAmount', () => {
  it('uses fixed minor units', () => {
    expect(formatAmount(new Dec('2180'), 'AUD')).toBe('2180.00');
    expect(formatAmount(new Dec('0.1'), 'GBP')).toBe('0.10');
    expect(formatAmount(new Dec('728.66'), 'SGD')).toBe('728.66');
    expect(formatAmount(new Dec('2180'), 'JPY')).toBe('2180');
    expect(formatAmount(new Dec('0'), 'VND')).toBe('0');
  });

  it('never emits exponent notation', () => {
    expect(formatAmount(new Dec('123456789012345.67'), 'AUD')).toBe(
      '123456789012345.67',
    );
    expect(formatAmount(new Dec('0.0000001'), 'AUD')).toBe('0.00');
    expect(formatAmount(new Dec('1e21'), 'AUD')).toBe(
      '1000000000000000000000.00',
    );
  });
});

describe('formatRate', () => {
  it('pads to the currency minor units', () => {
    expect(formatRate(new Dec('1000'), 'AUD')).toBe('1000.00');
    expect(formatRate(new Dec('12.5'), 'AUD')).toBe('12.50');
  });

  it('keeps up to 4 decimals and trims zeros beyond the minor units', () => {
    expect(formatRate(new Dec('0.3333'), 'AUD')).toBe('0.3333');
    expect(formatRate(new Dec('0.3300'), 'AUD')).toBe('0.33');
    expect(formatRate(new Dec('1.2500'), 'AUD')).toBe('1.25');
    expect(formatRate(new Dec('12.3450'), 'AUD')).toBe('12.345');
  });

  it('uses zero minor units for JPY', () => {
    expect(formatRate(new Dec('1000'), 'JPY')).toBe('1000');
    expect(formatRate(new Dec('12.5'), 'JPY')).toBe('12.5');
    expect(formatRate(new Dec('0.3333'), 'JPY')).toBe('0.3333');
  });

  it('rounds half up beyond 4 decimals', () => {
    expect(formatRate(new Dec('0.33335'), 'AUD')).toBe('0.3334');
  });
});

describe('formatPercent', () => {
  it('always has two decimals', () => {
    expect(formatPercent(new Dec('10'))).toBe('10.00');
    expect(formatPercent(new Dec('8.875'))).toBe('8.88');
    expect(formatPercent(new Dec('0'))).toBe('0.00');
    expect(formatPercent(new Dec('100'))).toBe('100.00');
  });
});
