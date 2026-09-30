import { isRouteErrorResponse, useRouteError } from 'react-router'
import { routes } from '@/shared/config'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

export function RouteError() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'An unexpected error occurred.'

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 px-4">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{detail}</AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button onClick={() => globalThis.location.reload()}>Reload</Button>
        <Button variant="outline" onClick={() => globalThis.location.assign(routes.invoices)}>
          Go to invoices
        </Button>
      </div>
    </main>
  )
}
