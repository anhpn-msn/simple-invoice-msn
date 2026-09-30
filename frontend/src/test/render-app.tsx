import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { appRoutes } from '@/app/router'
import { clearSession, setSession } from '@/shared/auth'
import { createTestQueryClient } from './render'
import type { RenderAppOptions } from './types'

/** Renders the real route table (guards, shell, lazy pages) at `route`. Use for cross-page flows. */
export function renderApp(route: string, options: RenderAppOptions = {}) {
  const { session = null } = options
  if (session) {
    setSession(session)
  } else {
    clearSession()
  }
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] })
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, user, router, queryClient }
}
