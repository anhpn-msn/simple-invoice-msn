import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { getSession } from '@/shared/auth'
import { accountantSession, auditorSession, renderApp, server } from '@/test'

describe('AppShell', () => {
  it('shows the app name, the invoices link, and the current user name and role', async () => {
    renderApp('/invoices', { session: accountantSession })

    const header = await screen.findByRole('banner')
    expect(within(header).getByText('SimpleInvoice')).toBeInTheDocument()
    expect(within(header).getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/invoices')
    expect(within(header).getByText('Demo Accountant')).toBeInTheDocument()
    expect(within(header).getByText('ACCOUNTANT')).toBeInTheDocument()
  })

  it('shows the auditor role', async () => {
    renderApp('/invoices', { session: auditorSession })

    expect(await screen.findByText('AUDITOR')).toBeInTheDocument()
  })

  it('logs out: calls the API, clears the session and navigates to /login', async () => {
    let logoutCalls = 0
    let csrfHeader: string | null = null
    server.use(
      http.post('/api/auth/logout', ({ request }) => {
        logoutCalls += 1
        csrfHeader = request.headers.get('x-requested-with')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user, router, queryClient } = renderApp('/invoices', { session: accountantSession })
    queryClient.setQueryData(['invoices', 'list', {}], { data: [] })

    await user.click(await screen.findByRole('button', { name: 'Logout' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(logoutCalls).toBe(1)
    expect(csrfHeader).toBe('SimpleInvoice')
    expect(getSession()).toBeNull()
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0))
  })

  it('still signs out locally when the logout request fails', async () => {
    server.use(http.post('/api/auth/logout', () => HttpResponse.error()))
    const { user, router } = renderApp('/invoices', { session: accountantSession })

    await user.click(await screen.findByRole('button', { name: 'Logout' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(getSession()).toBeNull()
  })
})
