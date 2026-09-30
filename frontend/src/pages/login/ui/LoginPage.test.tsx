import { screen } from '@testing-library/react'
import { TEST_PASSWORD, renderWithProviders } from '@/test'
import { LoginPage } from './LoginPage'

const stubs = [
  { path: '/invoices', element: <p>List stub</p> },
  { path: '/invoices/:id', element: <p>Detail stub</p> },
]

async function signIn(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(screen.getByLabelText('Email'), 'demo@example.com')
  await user.type(screen.getByLabelText('Password'), TEST_PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  it('renders the form in a titled page', () => {
    renderWithProviders(<LoginPage />, { route: '/login', path: '/login', extraRoutes: stubs })

    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('goes to the redirectTo target after a successful login', async () => {
    const { user } = renderWithProviders(<LoginPage />, {
      route: '/login?redirectTo=%2Finvoices%2Fabc',
      path: '/login',
      extraRoutes: stubs,
    })

    await signIn(user)

    expect(await screen.findByText('Detail stub')).toBeInTheDocument()
  })

  it('goes to /invoices when there is no redirectTo', async () => {
    const { user } = renderWithProviders(<LoginPage />, { route: '/login', path: '/login', extraRoutes: stubs })

    await signIn(user)

    expect(await screen.findByText('List stub')).toBeInTheDocument()
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['absolute url', 'https://evil.com/x'],
    ['backslash trick', '/\\evil.com'],
  ])('falls back to /invoices for an open redirect attempt (%s)', async (_name, target) => {
    const { user, router } = renderWithProviders(<LoginPage />, {
      route: `/login?redirectTo=${encodeURIComponent(target)}`,
      path: '/login',
      extraRoutes: stubs,
    })

    await signIn(user)

    expect(await screen.findByText('List stub')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/invoices')
  })
})
