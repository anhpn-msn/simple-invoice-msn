import { Link, useLocation } from 'react-router'
import { InvoiceStatusBadge, Money, type InvoiceSummary } from '@/entities/invoice'
import { LIST_RETURN_STATE_KEY, routes } from '@/shared/config'
import { formatDate } from '@/shared/lib/date'

interface InvoiceCardsProps {
  rows: InvoiceSummary[]
}

/** The stretched link (`after:absolute inset-0`) makes the whole card clickable with one tab stop. */
export function InvoiceCards({ rows }: Readonly<InvoiceCardsProps>) {
  const location = useLocation()
  const linkState = { [LIST_RETURN_STATE_KEY]: location.pathname + location.search }
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li
          key={row.invoiceId}
          className="relative grid gap-2 rounded-lg border bg-card p-4 text-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/50"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={routes.invoiceDetail(row.invoiceId)}
                state={linkState}
                className="block truncate font-medium text-primary after:absolute after:inset-0 focus-visible:outline-none"
              >
                {row.invoiceNumber}
              </Link>
              <p className="truncate text-muted-foreground">{row.customerName}</p>
            </div>
            <InvoiceStatusBadge status={row.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Invoice date</dt>
            <dd className="text-right">{formatDate(row.invoiceDate)}</dd>
            <dt className="text-muted-foreground">Due date</dt>
            <dd className="text-right">{formatDate(row.dueDate)}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-right font-medium">
              <Money amount={row.totalAmount} currency={row.currency} />
            </dd>
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="text-right">
              <Money amount={row.balanceAmount} currency={row.currency} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  )
}
