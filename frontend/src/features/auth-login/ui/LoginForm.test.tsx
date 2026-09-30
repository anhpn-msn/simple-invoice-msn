import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { getAccessToken } from '@/shared/auth'
import { TEST_ACCESS_TOKEN, TEST_PASSWORD, errorBody, renderWithProviders, server } from '@/test'
import { LoginForm } from './LoginForm'

function renderForm(onSuccess = vi.fn()) {
  const utils = renderWithProviders(<LoginForm onSuccess={onSuccess} />)
  return { ...utils, onSuccess }
}

describe('LoginForm', () => {
  it('shows required errors and sends nothing when the form is empty', async () => {
    const requests = vi.fn()
    server.use(http.post('/api/auth/login', () => requests()))
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email is required')
    expect(requests).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
  })

  it('rejects a password longer than 72 bytes (multi-byte characters count)', async () => {
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.type(screen.getByLabelText('Password'), 'é'.repeat(37))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Password must be at most 72 bytes')).toBeInTheDocument()
  })

  it('uses the right autocomplete hints and masks the password', () => {
    renderForm()

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('stores the session in memory only and calls onSuccess', async () => {
    const { user, onSuccess } = renderForm()

    await user.type(screen.getByLabelText('Email'), ' Demo@Example.com ')
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(getAccessToken()).toBe(TEST_ACCESS_TOKEN)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('shows one generic banner for a 401 and keeps the user on the form', async () => {
    const { user, onSuccess } = renderForm()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })

  it('shows the rate limit message for a 429', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json(errorBody(429, 'ThrottlerException: Too Many Requests', 'Too Many Requests'), { status: 429 }),
      ),
    )
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts, try again later')
  })

  it('disables the button while the request is pending', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('/api/auth/login', async () => {
        await gate
        return HttpResponse.json(errorBody(401, 'Invalid email or password', 'Unauthorized'), { status: 401 })
      }),
    )
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Email'), 'demo@example.com')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: 'Signing in' })).toBeDisabled()
    release()
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})
