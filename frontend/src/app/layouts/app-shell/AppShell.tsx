import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { logout, useCurrentUser } from '@/shared/auth'
import { routes } from '@/shared/config'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

export function AppShell() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    await logout()
    // Clear only after the protected page unmounts, or its observers re-create and refetch the queries.
    await navigate(routes.login, { replace: true })
    queryClient.clear()
  }

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link to={routes.invoices} className="text-base font-semibold tracking-tight text-primary">
            SimpleInvoice
          </Link>
          <nav aria-label="Main" className="ml-2 flex items-center gap-1">
            <NavLink
              to={routes.invoices}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted',
                  isActive ? 'bg-muted text-foreground' : 'text-muted-foreground',
                )
              }
            >
              Invoices
            </NavLink>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {user ? (
              <div className="flex min-w-0 items-center gap-2">
                <span className="max-w-32 truncate text-sm font-medium sm:max-w-56" data-testid="current-user-name">
                  {user.fullname}
                </span>
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {user.role}
                </Badge>
              </div>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={pending}>
              <LogOut aria-hidden="true" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
