import { http, HttpResponse } from 'msw'
import { makeLoginResponse, server } from '@/test'
import { refreshSession } from './refresh'
import { getAccessToken } from './session'

/** Minimal LockManager: runs the callback, remembers the name and whether another lock was held at that time. */
function installFakeLocks() {
  const calls: { name: string; startedWhileHeld: boolean }[] = []
  let held = 0
  const request = async (name: string, callback: () => Promise<unknown>) => {
    calls.push({ name, startedWhileHeld: held > 0 })
    held += 1
    try {
      return await callback()
    } finally {
      held -= 1
    }
  }
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  return calls
}

function removeLocks() {
  Reflect.deleteProperty(navigator, 'locks')
}

function refreshReturns(accessToken: string) {
  let sent = 0
  server.use(
    http.post('/api/auth/refresh', () => {
      sent += 1
      return HttpResponse.json(makeLoginResponse(undefined, accessToken))
    }),
  )
  return () => sent
}

afterEach(removeLocks)

describe('refreshSession and Web Locks', () => {
  it('sends the network refresh through the shared cross-tab lock', async () => {
    const calls = installFakeLocks()
    const requestsSent = refreshReturns('locked-token')

    await expect(refreshSession()).resolves.toBe(true)

    expect(calls).toEqual([{ name: 'simple-invoice:refresh', startedWhileHeld: false }])
    expect(requestsSent()).toBe(1)
    expect(getAccessToken()).toBe('locked-token')
  })

  it('takes one lock and sends one request for concurrent callers in the same tab', async () => {
    const calls = installFakeLocks()
    const requestsSent = refreshReturns('shared-token')

    await Promise.all([refreshSession(), refreshSession(), refreshSession()])

    expect(calls).toHaveLength(1)
    expect(requestsSent()).toBe(1)
  })

  it('releases the lock and resolves false when the refresh is rejected', async () => {
    const calls = installFakeLocks()
    server.use(
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 }),
      ),
    )

    await expect(refreshSession()).resolves.toBe(false)
    await expect(refreshSession()).resolves.toBe(false)

    expect(calls.map((call) => call.startedWhileHeld)).toEqual([false, false])
  })

  it('still refreshes when the browser has no Web Locks API', async () => {
    removeLocks()
    expect((navigator as { locks?: unknown }).locks).toBeUndefined()
    const requestsSent = refreshReturns('unlocked-token')

    await expect(refreshSession()).resolves.toBe(true)

    expect(requestsSent()).toBe(1)
    expect(getAccessToken()).toBe('unlocked-token')
  })
})
