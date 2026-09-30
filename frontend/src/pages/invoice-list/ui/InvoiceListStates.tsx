import { AlertCircle, FileText } from 'lucide-react'
import { Link } from 'react-router'
import { isApiError, NETWORK_ERROR_STATUS } from '@/shared/api'
import { routes } from '@/shared/config'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const SKELETON_ROW_COUNT = 6

export function InvoiceListSkeleton() {
  return (
    <div className="grid gap-3">
      <output aria-label="Loading invoices" className="sr-only">
        Loading invoices
      </output>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Skeleton key={index} aria-hidden="true" className="h-12 w-full" />
      ))}
    </div>
  )
}

interface InvoiceListErrorProps {
  error: unknown
  onRetry: () => void
}

export function InvoiceListError({ error, onRetry }: Readonly<InvoiceListErrorProps>) {
  const detail = isApiError(error) && error.status !== NETWORK_ERROR_STATUS ? error.messages[0] : 'The server could not be reached.'
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Could not load invoices</AlertTitle>
      <AlertDescription>
        <p>{detail}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}

interface InvoiceListEmptyProps {
  reason: 'filtered' | 'none' | 'page-out-of-range'
  canCreate: boolean
  onClearFilters: () => void
  onFirstPage: () => void
}

function EmptyBody({ reason, canCreate, onClearFilters, onFirstPage }: Readonly<InvoiceListEmptyProps>) {
  if (reason === 'page-out-of-range') {
    return (
      <>
        <h2 className="text-base font-medium">There are no invoices on this page</h2>
        <Button type="button" variant="outline" onClick={onFirstPage}>
          Go to first page
        </Button>
      </>
    )
  }
  if (reason === 'filtered') {
    return (
      <>
        <h2 className="text-base font-medium">No invoices match your filters</h2>
        <p className="text-sm text-muted-foreground">Try a different search or clear the filters.</p>
        <Button type="button" variant="outline" onClick={onClearFilters}>
          Clear filters
        </Button>
      </>
    )
  }
  return (
    <>
      <h2 className="text-base font-medium">No invoices yet</h2>
      {canCreate ? (
        <Button asChild>
          <Link to={routes.invoiceNew}>Create your first invoice</Link>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Invoices will appear here once they are created.</p>
      )}
    </>
  )
}

export function InvoiceListEmpty(props: Readonly<InvoiceListEmptyProps>) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
      <EmptyBody {...props} />
    </div>
  )
}
