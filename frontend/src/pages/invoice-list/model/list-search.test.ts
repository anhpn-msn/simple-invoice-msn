import {
  hasActiveFilters,
  hasNonDefaultState,
  isDateRangeInvalid,
  parseListSearchParams,
  toApiParams,
  toListSearchParams,
} from './list-search'

const parse = (query: string) => parseListSearchParams(new URLSearchParams(query))

describe('parseListSearchParams', () => {
  it('returns the defaults for an empty query string', () => {
    expect(parse('')).toEqual({ page: 1, pageSize: 10, sortBy: 'invoiceDate', ordering: 'DESC' })
  })

  it('reads valid values', () => {
    expect(
      parse('page=3&pageSize=20&sortBy=totalAmount&ordering=ASC&status=Paid&keyword=acme&fromDate=2026-01-31&toDate=2026-02-28'),
    ).toEqual({
      page: 3,
      pageSize: 20,
      sortBy: 'totalAmount',
      ordering: 'ASC',
      status: 'Paid',
      keyword: 'acme',
      fromDate: '2026-01-31',
      toDate: '2026-02-28',
    })
  })

  it('accepts ordering in any case', () => {
    expect(parse('ordering=asc').ordering).toBe('ASC')
  })

  it.each([
    ['page=0'],
    ['page=-1'],
    ['page=abc'],
    ['page=1.5'],
    ['page=1e2'],
    ['page=100001'],
    ['page='],
  ])('falls back to page 1 for %s', (query) => {
    expect(parse(query).page).toBe(1)
  })

  it.each([['pageSize=100'], ['pageSize=15'], ['pageSize=x'], ['pageSize=0']])('falls back to page size 10 for %s', (query) => {
    expect(parse(query).pageSize).toBe(10)
  })

  it('falls back for unknown sort, ordering and status values', () => {
    expect(parse('sortBy=customerName&ordering=UP&status=paid')).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: 'invoiceDate',
      ordering: 'DESC',
    })
  })

  it('drops dates that are not real calendar dates', () => {
    const parsed = parse('fromDate=2026-02-30&toDate=06/03/2026')
    expect(parsed.fromDate).toBeUndefined()
    expect(parsed.toDate).toBeUndefined()
  })

  it('trims the keyword and drops blank or too long ones', () => {
    expect(parse('keyword=%20%20acme%20').keyword).toBe('acme')
    expect(parse('keyword=%20%20').keyword).toBeUndefined()
    expect(parse(`keyword=${'a'.repeat(101)}`).keyword).toBeUndefined()
  })

  it('keeps valid values when a neighbour is invalid', () => {
    expect(parse('page=abc&status=Overdue').status).toBe('Overdue')
  })
})

describe('toListSearchParams', () => {
  it('omits default values', () => {
    expect(toListSearchParams(parse('')).toString()).toBe('')
  })

  it('round-trips non-default values', () => {
    const query = 'page=2&pageSize=50&sortBy=dueDate&ordering=ASC&status=Draft&keyword=acme&fromDate=2026-01-01&toDate=2026-01-31'
    expect(toListSearchParams(parse(query)).toString()).toBe(query)
  })
})

describe('helpers', () => {
  it('toApiParams always includes paging and sorting', () => {
    expect(toApiParams(parse('status=Paid'))).toMatchObject({ page: 1, pageSize: 10, sortBy: 'invoiceDate', ordering: 'DESC', status: 'Paid' })
  })

  it('detects an inverted date range', () => {
    expect(isDateRangeInvalid(parse('fromDate=2026-02-01&toDate=2026-01-01'))).toBe(true)
    expect(isDateRangeInvalid(parse('fromDate=2026-01-01&toDate=2026-01-01'))).toBe(false)
    expect(isDateRangeInvalid(parse('fromDate=2026-02-01'))).toBe(false)
  })

  it('separates narrowing filters from sorting and paging', () => {
    expect(hasActiveFilters(parse('sortBy=dueDate&page=2'))).toBe(false)
    expect(hasActiveFilters(parse('keyword=x'))).toBe(true)
    expect(hasNonDefaultState(parse('sortBy=dueDate'))).toBe(true)
    expect(hasNonDefaultState(parse('page=4'))).toBe(false)
  })
})
