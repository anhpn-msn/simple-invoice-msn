import { useSyncExternalStore } from 'react'
import type { AuthUser, LoginResponse, Session } from './types'

const EXPIRY_SKEW_MS = 10_000
const MS_PER_SECOND = 1000

// Memory only on purpose: the access token must never reach web storage (XSS exposure).
let current: Session | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSession(): Session | null {
  return current
}

export function getAccessToken(): string | null {
  return current?.accessToken ?? null
}

/** True when a token is held and is not about to expire. */
export function hasValidSession(now: number = Date.now()): boolean {
  return current !== null && current.expiresAt - EXPIRY_SKEW_MS > now
}

export function setSession(response: LoginResponse, now: number = Date.now()): void {
  current = {
    accessToken: response.accessToken,
    expiresAt: now + response.expiresIn * MS_PER_SECOND,
    user: response.user,
  }
  emit()
}

export function clearSession(): void {
  if (current === null) {
    return
  }
  current = null
  emit()
}

export function hasPermission(permission: string): boolean {
  return current?.user.permissions.includes(permission) ?? false
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession)
}

export function useCurrentUser(): AuthUser | null {
  return useSession()?.user ?? null
}

export function useHasPermission(permission: string): boolean {
  return useSyncExternalStore(subscribe, () => hasPermission(permission))
}
