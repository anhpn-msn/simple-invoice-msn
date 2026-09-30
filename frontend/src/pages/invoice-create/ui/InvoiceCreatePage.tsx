import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { InvoiceForm } from '@/features/invoice-create'
import { PERMISSIONS, useHasPermission } from '@/shared/auth'
import { routes } from '@/shared/config'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

export function InvoiceCreatePage() {
  const canCreate = useHasPermission(PERMISSIONS.invoiceCreate)
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link to={routes.invoices}>
            <ArrowLeft aria-hidden="true" />
            Back to invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Create invoice</h1>
      </div>

      {canCreate ? (
        <InvoiceForm onCreated={() => navigate(routes.invoices)} onCancel={() => navigate(routes.invoices)} />
      ) : (
        <Alert>
          <AlertTitle>Not allowed</AlertTitle>
          <AlertDescription>You do not have permission to create invoices.</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
