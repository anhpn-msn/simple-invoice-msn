import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { getAccessToken } from '@/shared/auth'
import { accountantSession, createApiHandlers, makeLoginResponse, renderApp, server } from '@/test'

describe('RequireAuth guard', () => {
  it('redirects to /login with the original path when there is no session and refresh fails', async () => {
    const { router } = renderApp('/invoices?status=Paid&page=2')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?redirectTo=%2Finvoices%3Fstatus%3DPaid%26page%3D2')
  })

  it('restores the session through one refresh call and renders the protected page', async () => {
    let refreshCalls = 0
    server.use(
      http.post('/api/auth/refresh', () => {
        refreshCalls += 1
        return HttpResponse.json(makeLoginResponse())
      }),
    )

    const { router } = renderApp('/invoices')

    expect(await screen.findByRole('heading', { name: 'Invoices' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/invoices')
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).not.toBeNull()
  })

  it('does not call refresh when a session is already in memory', async () => {
    let refreshCalls = 0
    server.use(
      http.post('/api/auth/refresh', () => {
        refreshCalls += 1
        return HttpResponse.json(makeLoginResponse())
      }),
    )

    renderApp('/invoices/new', { session: accountantSession })

    expect(await screen.findByRole('heading', { name: 'Create invoice' })).toBeInTheDocument()
    expect(refreshCalls).toBe(0)
  })

  it('redirects / to /invoices for a signed-in user', async () => {
    const { router } = renderApp('/', { session: accountantSession })

    await waitFor(() => expect(router.state.location.pathname).toBe('/invoices'))
  })

  it('sends a signed-in user away from /login', async () => {
    const { router } = renderApp('/login', { session: accountantSession })

    await waitFor(() => expect(router.state.location.pathname).toBe('/invoices'))
  })

  it('shows the login page to anonymous users', async () => {
    server.use(...createApiHandlers({ refreshCookie: false }))

    renderApp('/login')

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes without requiring auth', async () => {
    renderApp('/does/not/exist')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
