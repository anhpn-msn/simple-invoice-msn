import { InvoiceStatusBadge } from '@/entities/invoice'
import type { InvoiceDetail } from '@/entities/invoice'
import { formatDate } from '@/shared/lib/date'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { AmountsCard } from './AmountsCard'
import { LineItems } from './LineItems'

const NOT_PROVIDED = 'Not provided'

function Field({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm break-words">{value ?? NOT_PROVIDED}</dd>
    </div>
  )
}

export function InvoiceDetailView({ invoice }: Readonly<{ invoice: InvoiceDetail }>) {
  const { customer } = invoice

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight break-all">Invoice {invoice.invoiceNumber}</h1>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Invoice info</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Invoice number" value={invoice.invoiceNumber} />
              <Field label="Reference" value={invoice.invoiceReference} />
              <Field label="Invoice date" value={formatDate(invoice.invoiceDate)} />
              <Field label="Due date" value={formatDate(invoice.dueDate)} />
              <Field label="Currency" value={`${invoice.currency} (${invoice.currencySymbol})`} />
              <div className="sm:col-span-2">
                <Field label="Description" value={invoice.description} />
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Customer</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={customer.fullname} />
              <Field label="Email" value={customer.email} />
              <Field label="Mobile" value={customer.mobileNumber} />
              <Field label="Address" value={customer.address} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <LineItems items={invoice.items} currency={invoice.currency} />
      <AmountsCard invoice={invoice} />
    </div>
  )
}
