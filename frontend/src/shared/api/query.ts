import type { QueryParams } from './types'

/** Serializes params to `?a=1&b=2`, omitting undefined, null and blank strings. Returns '' when nothing remains. */
export function buildQuery(params: QueryParams | undefined): string {
  if (!params) {
    return ''
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue
    }
    if (typeof value === 'string' && value.trim() === '') {
      continue
    }
    search.set(key, String(value))
  }
  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}
