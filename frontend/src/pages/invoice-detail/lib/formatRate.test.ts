import { describe, expect, it } from 'vitest'
import { formatRate } from './formatRate'

describe('formatRate', () => {
  it.each([
    ['10.0000', '10'],
    ['8.2500', '8.25'],
    ['0.0000', '0'],
    ['0.5', '0.5'],
    ['5.0', '5'],
    ['100.100', '100.1'],
    ['10', '10'],
    ['100', '100'],
    ['0', '0'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatRate(input)).toBe(expected)
  })
})
