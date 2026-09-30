import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { invoiceDetailQueryOptions } from '@/entities/invoice'
import { HTTP_STATUS, isApiError } from '@/shared/api'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { BackToInvoicesLink } from './BackToInvoicesLink'
import { InvoiceDetailSkeleton } from './InvoiceDetailSkeleton'
import { InvoiceDetailView } from './InvoiceDetailView'

// The API answers 400 for an id that is not a UUID, which for the user is the same as "no such invoice".
function isNotFound(error: unknown): boolean {
  return isApiError(error) && (error.status === HTTP_STATUS.NOT_FOUND || error.status === HTTP_STATUS.BAD_REQUEST)
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const { data, error, isPending, refetch, isFetching } = useQuery({
    ...invoiceDetailQueryOptions(id),
    enabled: id !== '',
  })

  return (
    <div className="flex flex-col gap-4">
      <BackToInvoicesLink />
      {isPending && id !== '' ? <InvoiceDetailSkeleton /> : null}
      {id === '' || isNotFound(error) ? (
        <section className="flex flex-col items-start gap-2 py-8">
          <h1 className="text-2xl font-semibold tracking-tight">Invoice not found</h1>
          <p className="text-muted-foreground">
            This invoice does not exist or the link is not correct.
          </p>
        </section>
      ) : null}
      {error && !isNotFound(error) ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the invoice</AlertTitle>
          <AlertDescription>
            <p>Something went wrong while loading this invoice.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void refetch()} disabled={isFetching}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {data ? <InvoiceDetailView invoice={data} /> : null}
    </div>
  )
}
