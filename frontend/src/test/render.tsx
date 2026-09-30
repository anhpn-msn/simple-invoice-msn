import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { clearSession, setSession } from '@/shared/auth'
import type { RenderWithProvidersOptions } from './types'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

/** Renders `ui` inside a fresh QueryClient (retry off) and a memory data router. */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { route = '/', path = '*', session = null, extraRoutes = [], queryClient = createTestQueryClient() } = options

  if (session) {
    setSession(session)
  } else {
    clearSession()
  }

  const router = createMemoryRouter([{ path, element: ui }, ...extraRoutes], { initialEntries: [route] })
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, user, router, queryClient }
}
