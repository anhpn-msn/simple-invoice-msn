import { API_PATHS, AUTH_REQUEST_HEADERS, env, JSON_MEDIA_TYPE } from '@/shared/config'
import { clearSession, hasValidSession, setSession } from './session'
import type { LoginResponse } from './types'

const REFRESH_LOCK_NAME = 'simple-invoice:refresh'
const COOKIE_REQUEST_HEADERS = { Accept: JSON_MEDIA_TYPE, ...AUTH_REQUEST_HEADERS }

let inflight: Promise<boolean> | null = null

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<LoginResponse>
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.expiresIn === 'number' &&
    typeof candidate.user === 'object' &&
    candidate.user !== null
  )
}

async function requestRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${env.apiBaseUrl}${API_PATHS.refresh}`, {
      method: 'POST',
      credentials: 'include',
      headers: COOKIE_REQUEST_HEADERS,
    })
    if (!response.ok) {
      clearSession()
      return false
    }
    const body: unknown = await response.json()
    if (!isLoginResponse(body)) {
      clearSession()
      return false
    }
    setSession(body)
    return true
  } catch {
    clearSession()
    return false
  }
}

/**
 * Tabs share the refresh cookie but not memory. The lock makes tabs refresh one at a
 * time, so the second tab sends the cookie the first one just rotated. Without it both
 * would send the same token and the API would treat the second as reuse of a stolen token.
 * Browsers without Web Locks keep the per-tab behaviour.
 */
async function withRefreshLock(task: () => Promise<boolean>): Promise<boolean> {
  // lib.dom types `locks` as always present, but older browsers and jsdom lack it.
  const locks = (navigator as { locks?: LockManager }).locks
  return locks ? await locks.request(REFRESH_LOCK_NAME, task) : task()
}

/**
 * Restores the session from the refresh cookie. Concurrent callers in one tab share one
 * request, and tabs take turns (see `withRefreshLock`), because refresh tokens rotate and
 * a repeated old token revokes the whole family. Resolves true on success, false otherwise
 * (the session is cleared on failure).
 */
export function refreshSession(): Promise<boolean> {
  inflight ??= withRefreshLock(requestRefresh).finally(() => {
    inflight = null
  })
  return inflight
}

/** Resolves true when a usable session exists, refreshing once if the token is absent or expiring. */
export async function ensureSession(): Promise<boolean> {
  if (hasValidSession()) {
    return true
  }
  return refreshSession()
}

/** Revokes the refresh token server side (best effort) and always clears the local session. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${env.apiBaseUrl}${API_PATHS.logout}`, {
      method: 'POST',
      credentials: 'include',
      headers: COOKIE_REQUEST_HEADERS,
    })
  } catch {
    // The local session must end even if the network call fails.
  } finally {
    clearSession()
  }
}
