import { DomainValidationError } from './errors';
import type { CurrencyInfo } from './invoice.types';

/** Allowlist of accepted currency codes (SPEC 4.2); usable with IsIn and Swagger enums. */
export const SUPPORTED_CURRENCIES = [
  'AUD',
  'USD',
  'GBP',
  'EUR',
  'SGD',
  'JPY',
  'VND',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const REGISTRY: Readonly<Record<CurrencyCode, CurrencyInfo>> = {
  AUD: { code: 'AUD', symbol: 'AU$', minorUnits: 2 },
  USD: { code: 'USD', symbol: 'US$', minorUnits: 2 },
  GBP: { code: 'GBP', symbol: '£', minorUnits: 2 },
  EUR: { code: 'EUR', symbol: '€', minorUnits: 2 },
  SGD: { code: 'SGD', symbol: 'S$', minorUnits: 2 },
  JPY: { code: 'JPY', symbol: '¥', minorUnits: 0 },
  VND: { code: 'VND', symbol: '₫', minorUnits: 0 },
};

/** Type guard: true when `code` is in the currency allowlist (case-sensitive). */
export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && Object.hasOwn(REGISTRY, code);
}

/** Returns the registry entry for `code`; throws DomainValidationError for unknown codes. */
export function getCurrency(code: string): CurrencyInfo {
  if (!isSupportedCurrency(code)) {
    throw new DomainValidationError(
      `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
    );
  }
  return REGISTRY[code];
}
