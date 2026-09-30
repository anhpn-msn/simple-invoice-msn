import { FileQuestion } from 'lucide-react'
import { Link } from 'react-router'
import { routes } from '@/shared/config'
import { Button } from '@/shared/ui/button'

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <FileQuestion aria-hidden="true" className="size-12 text-muted-foreground" />
      <p className="text-sm font-medium text-muted-foreground">Error 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <Button asChild>
        <Link to={routes.invoices}>Back to invoices</Link>
      </Button>
    </main>
  )
}
