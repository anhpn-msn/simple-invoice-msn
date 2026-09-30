import { safeRedirectPath } from './redirect'

describe('safeRedirectPath', () => {
  it('keeps same-origin absolute paths, search and hash', () => {
    expect(safeRedirectPath('/invoices/123')).toBe('/invoices/123')
    expect(safeRedirectPath('/invoices?status=Paid&page=2')).toBe('/invoices?status=Paid&page=2')
    expect(safeRedirectPath('/')).toBe('/')
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['slash-backslash', '/\\evil.com'],
    ['embedded backslash', '/foo\\bar'],
    ['absolute url', 'https://evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative path', 'invoices'],
    ['tab smuggling', '/\t/evil.com'],
    ['newline smuggling', '/\n/evil.com'],
    ['empty', ''],
  ])('falls back for %s', (_name, input) => {
    expect(safeRedirectPath(input)).toBe('/invoices')
  })

  it('falls back for null and undefined', () => {
    expect(safeRedirectPath(null)).toBe('/invoices')
    expect(safeRedirectPath(undefined)).toBe('/invoices')
  })
})
