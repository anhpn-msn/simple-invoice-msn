import { clearSession, getAccessToken, refreshSession } from '@/shared/auth'
import { API_PATHS, AUTH_PATH_PREFIX, AUTH_REQUEST_HEADERS, env, JSON_MEDIA_TYPE } from '@/shared/config'
import { ApiError, apiErrorFromResponse, NETWORK_ERROR_MESSAGE } from './error'
import { buildQuery } from './query'
import { HTTP_STATUS, NETWORK_ERROR_STATUS } from './status'
import type { RequestOptions, UnauthorizedHandler } from './types'

const NO_REFRESH_PATHS = new Set<string>([API_PATHS.login, API_PATHS.refresh, API_PATHS.logout])

let onUnauthorized: UnauthorizedHandler | null = null

/** Registered by `app/`: called after a 401 that a refresh could not recover from (session already cleared). */
export function setOnUnauthorized(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

function isCookiePath(path: string): boolean {
  return path.startsWith(AUTH_PATH_PREFIX)
}

async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: JSON_MEDIA_TYPE, ...options.headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = JSON_MEDIA_TYPE
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const cookiePath = isCookiePath(path)
  if (cookiePath) {
    Object.assign(headers, AUTH_REQUEST_HEADERS)
  }
  try {
    return await fetch(`${env.apiBaseUrl}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: cookiePath ? 'include' : 'same-origin',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError(NETWORK_ERROR_STATUS, [NETWORK_ERROR_MESSAGE], error)
  }
}

async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/**
 * JSON request against `/api`. A 401 on a protected call triggers one
 * single-flight refresh and one retry; if that fails the session is cleared and
 * the `onUnauthorized` handler runs.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const tokenUsed = getAccessToken()
  let response = await send(path, options, tokenUsed)

  if (response.status === HTTP_STATUS.UNAUTHORIZED && !NO_REFRESH_PATHS.has(path)) {
    const currentToken = getAccessToken()
    // Another request may already have refreshed while this one was in flight.
    const recovered = currentToken !== null && currentToken !== tokenUsed ? true : await refreshSession()
    if (recovered) {
      response = await send(path, options, getAccessToken())
    }
    if (!recovered || response.status === HTTP_STATUS.UNAUTHORIZED) {
      clearSession()
      onUnauthorized?.()
      throw await apiErrorFromResponse(response)
    }
  }

  if (!response.ok) {
    throw await apiErrorFromResponse(response)
  }
  return parseBody<T>(response)
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
}
