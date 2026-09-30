const DEFAULT_MINOR_UNITS = 2

/** Mirror of the server currency registry (SPEC 4.2). The server stays the authority. */
export const CURRENCIES = [
  { code: 'AUD', minorUnits: 2 },
  { code: 'USD', minorUnits: 2 },
  { code: 'GBP', minorUnits: 2 },
  { code: 'EUR', minorUnits: 2 },
  { code: 'SGD', minorUnits: 2 },
  { code: 'JPY', minorUnits: 0 },
  { code: 'VND', minorUnits: 0 },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export const CURRENCY_CODES = CURRENCIES.map((currency) => currency.code) as [CurrencyCode, ...CurrencyCode[]]

/** Preselected in the create form. */
export const DEFAULT_CURRENCY: CurrencyCode = 'AUD'

export function minorUnitsOf(code: string): number {
  return CURRENCIES.find((currency) => currency.code === code)?.minorUnits ?? DEFAULT_MINOR_UNITS
}
