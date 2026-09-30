import {
  SUPPORTED_CURRENCIES,
  getCurrency,
  isSupportedCurrency,
} from './currency-registry';
import { DomainValidationError } from './errors';

describe('currency registry', () => {
  it.each([
    ['AUD', 'AU$', 2],
    ['USD', 'US$', 2],
    ['GBP', '£', 2],
    ['EUR', '€', 2],
    ['SGD', 'S$', 2],
    ['JPY', '¥', 0],
    ['VND', '₫', 0],
  ])('%s has symbol %s and %i minor units', (code, symbol, minorUnits) => {
    expect(getCurrency(code)).toEqual({ code, symbol, minorUnits });
  });

  it('lists exactly the seven supported currencies', () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual([
      'AUD',
      'USD',
      'GBP',
      'EUR',
      'SGD',
      'JPY',
      'VND',
    ]);
  });

  it('throws DomainValidationError for unknown codes', () => {
    expect(() => getCurrency('XYZ')).toThrow(DomainValidationError);
    expect(() => getCurrency('aud')).toThrow(DomainValidationError);
    expect(() => getCurrency('toString')).toThrow(DomainValidationError);
  });

  it('isSupportedCurrency is a strict allowlist check', () => {
    expect(isSupportedCurrency('AUD')).toBe(true);
    expect(isSupportedCurrency('aud')).toBe(false);
    expect(isSupportedCurrency('KWD')).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
    expect(isSupportedCurrency('constructor')).toBe(false);
  });
});
