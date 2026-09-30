import { QueryClient } from '@tanstack/react-query'
import { isApiError, isClientError } from '@/shared/api'

const MAX_RETRIES = 2
const QUERY_STALE_TIME_MS = 30_000

/** Client errors (4xx) are deterministic, so only network and 5xx failures are retried. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && isClientError(error.status)) {
    return false
  }
  return failureCount < MAX_RETRIES
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
    },
  })
}
