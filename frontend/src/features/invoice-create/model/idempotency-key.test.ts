import { newIdempotencyKey } from './idempotency-key'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newIdempotencyKey', () => {
  it('returns a UUID v4', () => {
    expect(newIdempotencyKey()).toMatch(UUID_V4)
  })

  it('still returns a UUID v4 when randomUUID is missing (plain http)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    try {
      const first = newIdempotencyKey()
      expect(first).toMatch(UUID_V4)
      expect(newIdempotencyKey()).not.toBe(first)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
