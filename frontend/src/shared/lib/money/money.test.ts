import { formatMoney, isDecimalString } from './money'

describe('formatMoney', () => {
  it('formats a two-decimal currency', () => {
    expect(formatMoney('2180.00', 'AUD')).toBe('A$2,180.00')
    expect(formatMoney('728.66', 'USD')).toBe('$728.66')
  })

  it('pads whole numbers to the currency minor units', () => {
    expect(formatMoney('10', 'EUR')).toBe('€10.00')
  })

  it('uses zero decimals for JPY and VND', () => {
    expect(formatMoney('1500', 'JPY')).toBe('¥1,500')
    expect(formatMoney('250000', 'VND')).toBe('₫250,000')
  })

  it('keeps precision beyond double range for large values', () => {
    expect(formatMoney('999999999999999999.99', 'USD')).toBe('$999,999,999,999,999,999.99')
    expect(formatMoney('9007199254740993.01', 'USD')).toBe('$9,007,199,254,740,993.01')
  })

  it('shows up to 4 decimals for unit rates', () => {
    expect(formatMoney('0.3333', 'AUD')).toBe('A$0.3333')
    expect(formatMoney('150.5000', 'AUD')).toBe('A$150.50')
  })

  it('formats negative balances', () => {
    expect(formatMoney('-12.50', 'USD')).toBe('-$12.50')
  })

  it('honours the locale', () => {
    expect(formatMoney('1234.5', 'EUR', 'de-DE')).toBe('1.234,50 €')
  })

  it('falls back to the raw text for non-decimal input', () => {
    expect(formatMoney('abc', 'USD')).toBe('abc USD')
  })
})

describe('isDecimalString', () => {
  it('accepts plain decimals within the limit', () => {
    expect(isDecimalString('10', 2)).toBe(true)
    expect(isDecimalString('10.5', 2)).toBe(true)
    expect(isDecimalString('10.55', 2)).toBe(true)
    expect(isDecimalString('0.3333', 4)).toBe(true)
  })

  it('rejects too many decimals, signs, exponents and junk', () => {
    expect(isDecimalString('10.555', 2)).toBe(false)
    expect(isDecimalString('-1', 2)).toBe(false)
    expect(isDecimalString('1e3', 2)).toBe(false)
    expect(isDecimalString('1,000.00', 2)).toBe(false)
    expect(isDecimalString('.5', 2)).toBe(false)
    expect(isDecimalString('5.', 2)).toBe(false)
    expect(isDecimalString('', 2)).toBe(false)
    expect(isDecimalString(' 1', 2)).toBe(false)
  })

  it('allows no fraction when maxDecimals is 0', () => {
    expect(isDecimalString('1500', 0)).toBe(true)
    expect(isDecimalString('1500.0', 0)).toBe(false)
  })
})
