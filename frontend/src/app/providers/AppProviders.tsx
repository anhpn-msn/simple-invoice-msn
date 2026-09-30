import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router/dom'
import { setOnUnauthorized } from '@/shared/api'
import { routes } from '@/shared/config'
import { Toaster } from '@/shared/ui/sonner'
import { createAppRouter } from '../router'
import { createQueryClient } from './query-client'

export function AppProviders() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createAppRouter)

  useEffect(() => {
    setOnUnauthorized(() => {
      queryClient.clear()
      const { pathname, search } = router.state.location
      if (pathname === routes.login) {
        return
      }
      void router.navigate(routes.loginWithRedirect(pathname + search), { replace: true })
    })
    return () => setOnUnauthorized(null)
  }, [queryClient, router])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors closeButton />
    </QueryClientProvider>
  )
}
