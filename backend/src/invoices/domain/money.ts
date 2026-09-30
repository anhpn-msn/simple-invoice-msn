import Decimal from 'decimal.js';
import { getCurrency } from './currency-registry';
import { DomainValidationError } from './errors';
import type { ParseDecimalOptions } from './invoice.types';
import { PERCENT_DECIMALS } from './invoice.constants';

/**
 * Isolated decimal.js constructor: precision 40 keeps every product exact
 * (max 15 + 4 digits times a 6 digit quantity), HALF_UP matches tax authority
 * guidance and PostgreSQL round() for non-negative values.
 */
export const Dec = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});
export type Dec = Decimal;

/** Longest decimal string the API accepts, in decimals (SPEC A-4). */
export const MAX_INPUT_DECIMALS = 4;

const DECIMAL_STRING = /^\d{1,15}(\.\d{1,4})?$/;

/**
 * Strictly parses a plain decimal string (`^\d{1,15}(\.\d{1,4})?$`): no sign,
 * exponent, whitespace or separators. Throws DomainValidationError otherwise.
 */
export function parseDecimalString(
  input: string,
  options: ParseDecimalOptions,
): Decimal {
  const field = options.field ?? 'value';
  if (typeof input !== 'string' || !DECIMAL_STRING.test(input)) {
    throw new DomainValidationError(
      `${field} must be a decimal string such as "10" or "10.50" (no sign, exponent or spaces)`,
    );
  }
  const fraction = input.split('.')[1] ?? '';
  if (fraction.length > options.maxDecimals) {
    throw new DomainValidationError(
      `${field} must have at most ${options.maxDecimals} decimal places`,
    );
  }
  const value = new Dec(input);
  if (!options.allowZero && value.isZero()) {
    throw new DomainValidationError(`${field} must be greater than 0`);
  }
  return value;
}

/** Rounds to the ISO 4217 minor units of `currency` using ROUND_HALF_UP. */
export function roundToCurrency(value: Decimal, currency: string): Decimal {
  return new Dec(value).toDecimalPlaces(
    getCurrency(currency).minorUnits,
    Dec.ROUND_HALF_UP,
  );
}

/** Wire format for amounts: fixed minor units, never exponent notation ("2180.00", JPY "2180"). */
export function formatAmount(value: Decimal, currency: string): string {
  return new Dec(value).toFixed(
    getCurrency(currency).minorUnits,
    Dec.ROUND_HALF_UP,
  );
}

/**
 * Wire format for unit rates: at least the currency minor units, at most 4
 * decimals, extra trailing zeros trimmed ("1000.00", "0.3333", "12.50").
 */
export function formatRate(value: Decimal, currency: string): string {
  const minor = getCurrency(currency).minorUnits;
  const rounded = new Dec(value).toDecimalPlaces(
    MAX_INPUT_DECIMALS,
    Dec.ROUND_HALF_UP,
  );
  return rounded.toFixed(Math.max(rounded.decimalPlaces(), minor));
}

/** Wire format for percentages with two decimals ("10.00"). */
export function formatPercent(value: Decimal): string {
  return new Dec(value).toFixed(PERCENT_DECIMALS, Dec.ROUND_HALF_UP);
}
