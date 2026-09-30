export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: QueryParams
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type UnauthorizedHandler = () => void
