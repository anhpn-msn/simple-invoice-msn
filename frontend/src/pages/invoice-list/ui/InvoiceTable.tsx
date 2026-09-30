import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { InvoiceStatusBadge, Money, type InvoiceSortBy, type InvoiceSummary } from '@/entities/invoice'
import { LIST_RETURN_STATE_KEY, routes } from '@/shared/config'
import { formatDate } from '@/shared/lib/date'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { SORT_LABELS } from '../model/constants'
import type { InvoiceListFilters } from '../model/types'

interface InvoiceTableProps {
  rows: InvoiceSummary[]
  sortBy: InvoiceListFilters['sortBy']
  ordering: InvoiceListFilters['ordering']
  onSort: (field: InvoiceSortBy) => void
}

function SortIcon({ active, ordering }: Readonly<{ active: boolean; ordering: InvoiceListFilters['ordering'] }>) {
  const className = `size-3.5 ${active ? '' : 'text-muted-foreground'}`
  if (active) {
    return ordering === 'ASC' ? <ArrowUp aria-hidden="true" className={className} /> : <ArrowDown aria-hidden="true" className={className} />
  }
  return <ArrowUpDown aria-hidden="true" className={className} />
}

function ariaSort(active: boolean, ordering: InvoiceListFilters['ordering']) {
  if (active) {
    return ordering === 'ASC' ? 'ascending' : 'descending'
  }
  return 'none'
}

function SortableHead({
  field,
  sortBy,
  ordering,
  onSort,
  align = 'left',
}: Readonly<{
  field: InvoiceSortBy
  sortBy: InvoiceSortBy
  ordering: InvoiceListFilters['ordering']
  onSort: (field: InvoiceSortBy) => void
  align?: 'left' | 'right'
}>) {
  const active = sortBy === field
  return (
    <TableHead
      aria-sort={ariaSort(active, ordering)}
      className={align === 'right' ? 'text-right' : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 rounded-sm font-medium hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        {SORT_LABELS[field]}
        <SortIcon active={active} ordering={ordering} />
      </button>
    </TableHead>
  )
}

export function InvoiceTable({ rows, sortBy, ordering, onSort }: Readonly<InvoiceTableProps>) {
  const navigate = useNavigate()
  const location = useLocation()
  const linkState = { [LIST_RETURN_STATE_KEY]: location.pathname + location.search }

  function openRow(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if ((event.target as HTMLElement).closest('a')) {
      return
    }
    void navigate(routes.invoiceDetail(id), { state: linkState })
  }

  function openRowByKey(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      void navigate(routes.invoiceDetail(id), { state: linkState })
    }
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Invoice</TableHead>
            <TableHead>Customer</TableHead>
            <SortableHead field="invoiceDate" sortBy={sortBy} ordering={ordering} onSort={onSort} />
            <SortableHead field="dueDate" sortBy={sortBy} ordering={ordering} onSort={onSort} />
            <SortableHead field="totalAmount" sortBy={sortBy} ordering={ordering} onSort={onSort} align="right" />
            <TableHead className="text-right">Balance</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.invoiceId}
              tabIndex={0}
              className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
              onClick={(event) => openRow(event, row.invoiceId)}
              onKeyDown={(event) => openRowByKey(event, row.invoiceId)}
            >
              <TableCell className="font-medium">
                <Link
                  to={routes.invoiceDetail(row.invoiceId)}
                  state={linkState}
                  tabIndex={-1}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {row.invoiceNumber}
                </Link>
              </TableCell>
              <TableCell className="max-w-56 truncate">{row.customerName}</TableCell>
              <TableCell>{formatDate(row.invoiceDate)}</TableCell>
              <TableCell>{formatDate(row.dueDate)}</TableCell>
              <TableCell className="text-right">
                <Money amount={row.totalAmount} currency={row.currency} />
              </TableCell>
              <TableCell className="text-right">
                <Money amount={row.balanceAmount} currency={row.currency} />
              </TableCell>
              <TableCell>
                <InvoiceStatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
