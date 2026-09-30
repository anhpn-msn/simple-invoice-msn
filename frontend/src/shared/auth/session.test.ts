import { http, HttpResponse } from 'msw'
import { accountantSession, auditorSession, makeLoginResponse, server } from '@/test'
import { ensureSession, logout, refreshSession } from './refresh'
import {
  clearSession,
  getAccessToken,
  getSession,
  hasPermission,
  hasValidSession,
  setSession,
  subscribe,
} from './session'

describe('session store', () => {
  it('starts empty and stores token, expiry and user in memory', () => {
    expect(getSession()).toBeNull()

    setSession(accountantSession, 1_000)

    expect(getAccessToken()).toBe(accountantSession.accessToken)
    expect(getSession()?.expiresAt).toBe(1_000 + 3_600_000)
    expect(getSession()?.user.email).toBe('demo@example.com')
  })

  it('never touches web storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    setSession(accountantSession)

    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('notifies subscribers on set and clear, and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    setSession(accountantSession)
    clearSession()
    unsubscribe()
    setSession(accountantSession)

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('checks permissions against the current user', () => {
    expect(hasPermission('invoice:read')).toBe(false)

    setSession(auditorSession)
    expect(hasPermission('invoice:read')).toBe(true)
    expect(hasPermission('invoice:create')).toBe(false)

    setSession(accountantSession)
    expect(hasPermission('invoice:create')).toBe(true)
  })

  it('treats a token close to expiry as invalid', () => {
    setSession({ ...accountantSession, expiresIn: 5 }, 0)

    expect(hasValidSession(0)).toBe(false)
    setSession({ ...accountantSession, expiresIn: 60 }, 0)
    expect(hasValidSession(0)).toBe(true)
  })
})

describe('refreshSession', () => {
  it('sets the session on success', async () => {
    server.use(http.post('/api/auth/refresh', () => HttpResponse.json(makeLoginResponse(undefined, 'fresh'))))

    await expect(refreshSession()).resolves.toBe(true)

    expect(getAccessToken()).toBe('fresh')
  })

  it('is single-flight', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/refresh', async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        return HttpResponse.json(makeLoginResponse())
      }),
    )

    await Promise.all([refreshSession(), refreshSession(), ensureSession()])

    expect(calls).toBe(1)
  })

  it('clears the session and resolves false on failure', async () => {
    setSession(accountantSession)
    server.use(http.post('/api/auth/refresh', () => HttpResponse.json({ statusCode: 401, message: 'x', error: 'x' }, { status: 401 })))

    await expect(refreshSession()).resolves.toBe(false)

    expect(getSession()).toBeNull()
  })

  it('ensureSession skips the network when the token is valid', async () => {
    setSession(accountantSession)

    await expect(ensureSession()).resolves.toBe(true)
  })
})

describe('logout', () => {
  it('calls the endpoint with the CSRF header and clears the session even on failure', async () => {
    setSession(accountantSession)
    let header: string | null = null
    server.use(
      http.post('/api/auth/logout', ({ request }) => {
        header = request.headers.get('x-requested-with')
        return HttpResponse.error()
      }),
    )

    await logout()

    expect(header).toBe('SimpleInvoice')
    expect(getSession()).toBeNull()
  })
})
