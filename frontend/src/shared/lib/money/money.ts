const DEFAULT_LOCALE = 'en-US'
const MAX_DISPLAY_DECIMALS = 4
const DEFAULT_MINOR_UNITS = 2
const SIGNED_DECIMAL = /^-?\d+(\.\d+)?$/

const formatters = new Map<string, Intl.NumberFormat>()

function getFormatter(locale: string, currency: string, minDigits?: number, maxDigits?: number): Intl.NumberFormat {
  const key = `${locale}|${currency}|${minDigits ?? ''}|${maxDigits ?? ''}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    })
    formatters.set(key, formatter)
  }
  return formatter
}

function decimalsOf(amount: string): number {
  const dot = amount.indexOf('.')
  return dot === -1 ? 0 : amount.length - dot - 1
}

/**
 * Formats a decimal string as currency. The string goes to Intl.NumberFormat
 * unchanged (never parsed into a JS number). Shows the currency's own minor
 * units, or up to 4 decimals when the string carries more (unit rates).
 */
export function formatMoney(amount: string, currency: string, locale: string = DEFAULT_LOCALE): string {
  if (!SIGNED_DECIMAL.test(amount)) {
    return `${amount} ${currency}`
  }
  const minorUnits = getFormatter(locale, currency).resolvedOptions().minimumFractionDigits ?? DEFAULT_MINOR_UNITS
  const maxDigits = Math.max(minorUnits, Math.min(decimalsOf(amount), MAX_DISPLAY_DECIMALS))
  return getFormatter(locale, currency, minorUnits, maxDigits).format(amount as `${number}`)
}

/** True for a plain non-negative decimal string with at most `maxDecimals` fractional digits. */
export function isDecimalString(value: string, maxDecimals: number): boolean {
  if (maxDecimals <= 0) {
    return /^\d+$/.test(value)
  }
  return new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`).test(value)
}
