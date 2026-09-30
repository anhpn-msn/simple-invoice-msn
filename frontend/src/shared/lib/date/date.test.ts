import { formatDate, isRealDate, todayLocal } from './date'

describe('formatDate', () => {
  it('formats a YYYY-MM-DD string', () => {
    expect(formatDate('2026-06-03')).toBe('03 Jun 2026')
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026')
  })

  it('returns non-date input unchanged', () => {
    expect(formatDate('not a date')).toBe('not a date')
  })
})

describe('todayLocal', () => {
  it('uses local calendar fields, zero padded', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayLocal(new Date(2026, 8, 30, 0, 0))).toBe('2026-09-30')
  })
})

describe('isRealDate', () => {
  it('accepts real calendar dates, including a leap day', () => {
    expect(isRealDate('2026-06-03')).toBe(true)
    expect(isRealDate('2028-02-29')).toBe(true)
  })

  it('rejects impossible dates and other shapes', () => {
    expect(isRealDate('2026-02-30')).toBe(false)
    expect(isRealDate('2027-02-29')).toBe(false)
    expect(isRealDate('2026-13-01')).toBe(false)
    expect(isRealDate('2026-6-3')).toBe(false)
    expect(isRealDate('')).toBe(false)
  })
})
