import { http, HttpResponse } from 'msw'
import { clearSession, getAccessToken, setSession } from '@/shared/auth'
import { makeLoginResponse, server } from '@/test'
import { api, setOnUnauthorized } from './client'
import { ApiError } from './error'

const OLD = 'old-token'
const NEW = 'new-token'

function unauthorized() {
  return HttpResponse.json({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 })
}

function protectedHandler(seen?: (token: string | null) => void) {
  return http.get('/api/invoices', ({ request }) => {
    const token = request.headers.get('authorization')
    seen?.(token)
    return token === `Bearer ${NEW}` ? HttpResponse.json({ ok: true }) : unauthorized()
  })
}

afterEach(() => {
  setOnUnauthorized(null)
})

describe('api client', () => {
  it('sends the bearer token and omits blank query params', async () => {
    setSession(makeLoginResponse(undefined, OLD))
    let seenUrl = ''
    let seenAuth: string | null = null
    server.use(
      http.get('/api/invoices', ({ request }) => {
        seenUrl = request.url
        seenAuth = request.headers.get('authorization')
        return HttpResponse.json({ data: [] })
      }),
    )

    await api.get('/invoices', { query: { page: 2, keyword: '', status: undefined } })

    expect(new URL(seenUrl).search).toBe('?page=2')
    expect(seenAuth).toBe(`Bearer ${OLD}`)
  })

  it('sends credentials and the CSRF header only on /auth calls', async () => {
    let authHeader: string | null = null
    let apiHeader: string | null = 'unset'
    server.use(
      http.post('/api/auth/logout', ({ request }) => {
        authHeader = request.headers.get('x-requested-with')
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/invoices', ({ request }) => {
        apiHeader = request.headers.get('x-requested-with')
        return HttpResponse.json({})
      }),
    )

    await api.post('/auth/logout')
    await api.get('/invoices')

    expect(authHeader).toBe('SimpleInvoice')
    expect(apiHeader).toBeNull()
  })

  it('refreshes once on 401 and retries the request', async () => {
    setSession(makeLoginResponse(undefined, OLD))
    let refreshCalls = 0
    server.use(
      protectedHandler(),
      http.post('/api/auth/refresh', () => {
        refreshCalls += 1
        return HttpResponse.json(makeLoginResponse(undefined, NEW))
      }),
    )

    await expect(api.get('/invoices')).resolves.toEqual({ ok: true })

    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBe(NEW)
  })

  it('shares a single refresh between concurrent 401s', async () => {
    setSession(makeLoginResponse(undefined, OLD))
    let refreshCalls = 0
    server.use(
      protectedHandler(),
      http.post('/api/auth/refresh', async () => {
        refreshCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return HttpResponse.json(makeLoginResponse(undefined, NEW))
      }),
    )

    const results = await Promise.all([api.get('/invoices'), api.get('/invoices'), api.get('/invoices')])

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshCalls).toBe(1)
  })

  it('clears the session and notifies when the refresh fails', async () => {
    setSession(makeLoginResponse(undefined, OLD))
    const onUnauthorized = vi.fn()
    setOnUnauthorized(onUnauthorized)
    server.use(
      protectedHandler(),
      http.post('/api/auth/refresh', () => unauthorized()),
    )

    await expect(api.get('/invoices')).rejects.toMatchObject({ status: 401 })

    expect(getAccessToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('clears the session when the retry is still 401', async () => {
    setSession(makeLoginResponse(undefined, OLD))
    const onUnauthorized = vi.fn()
    setOnUnauthorized(onUnauthorized)
    server.use(
      http.get('/api/invoices', () => unauthorized()),
      http.post('/api/auth/refresh', () => HttpResponse.json(makeLoginResponse(undefined, NEW))),
    )

    await expect(api.get('/invoices')).rejects.toBeInstanceOf(ApiError)

    expect(getAccessToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not try to refresh when login itself returns 401', async () => {
    let refreshCalls = 0
    server.use(
      http.post('/api/auth/login', () => unauthorized()),
      http.post('/api/auth/refresh', () => {
        refreshCalls += 1
        return unauthorized()
      }),
    )

    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toMatchObject({ status: 401 })

    expect(refreshCalls).toBe(0)
  })

  it('maps the error body into ApiError with messages', async () => {
    clearSession()
    server.use(
      http.post('/api/invoices', () =>
        HttpResponse.json(
          { statusCode: 400, message: ['dueDate must be on or after invoiceDate', 'currency is invalid'], error: 'Bad Request' },
          { status: 400 },
        ),
      ),
    )

    const error = await api.post('/invoices', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      messages: ['dueDate must be on or after invoiceDate', 'currency is invalid'],
    })
  })

  it('wraps a string message and handles non-JSON error bodies', async () => {
    server.use(
      http.get('/api/invoices/missing', () =>
        HttpResponse.json({ statusCode: 404, message: 'Invoice not found', error: 'Not Found' }, { status: 404 }),
      ),
      http.get('/api/boom', () => new HttpResponse('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })),
    )

    await expect(api.get('/invoices/missing')).rejects.toMatchObject({ status: 404, messages: ['Invoice not found'] })
    await expect(api.get('/boom')).rejects.toMatchObject({ status: 502, messages: ['Bad Gateway'] })
  })

  it('reports network failures as ApiError status 0', async () => {
    server.use(http.get('/api/invoices', () => HttpResponse.error()))

    await expect(api.get('/invoices')).rejects.toMatchObject({ status: 0 })
  })

  it('returns undefined for 204', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))

    await expect(api.post('/auth/logout')).resolves.toBeUndefined()
  })
})
