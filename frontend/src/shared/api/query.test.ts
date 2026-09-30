import { buildQuery } from './query'

describe('buildQuery', () => {
  it('returns an empty string when there is nothing to send', () => {
    expect(buildQuery(undefined)).toBe('')
    expect(buildQuery({})).toBe('')
  })

  it('omits undefined, null, empty and blank values', () => {
    expect(buildQuery({ a: undefined, b: null, c: '', d: '   ', e: 'x' })).toBe('?e=x')
  })

  it('keeps zero and false', () => {
    expect(buildQuery({ page: 0, flag: false })).toBe('?page=0&flag=false')
  })

  it('encodes values', () => {
    expect(buildQuery({ keyword: 'a&b c' })).toBe('?keyword=a%26b+c')
  })
})
