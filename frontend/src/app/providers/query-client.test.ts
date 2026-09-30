import { ApiError } from '@/shared/api'
import { createQueryClient, shouldRetry } from './query-client'

describe('query client defaults', () => {
  it('uses a 30s stale time and no refetch on window focus', () => {
    const options = createQueryClient().getDefaultOptions().queries

    expect(options?.staleTime).toBe(30_000)
    expect(options?.refetchOnWindowFocus).toBe(false)
  })

  it('never retries 4xx errors', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldRetry(0, new ApiError(status, ['x']))).toBe(false)
    }
  })

  it('retries network and 5xx failures a limited number of times', () => {
    expect(shouldRetry(0, new ApiError(0, ['network']))).toBe(true)
    expect(shouldRetry(1, new ApiError(503, ['x']))).toBe(true)
    expect(shouldRetry(2, new ApiError(503, ['x']))).toBe(false)
    expect(shouldRetry(0, new Error('boom'))).toBe(true)
  })
})
