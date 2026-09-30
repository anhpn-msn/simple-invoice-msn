import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import type { InvoiceStatus } from '../model/constants'

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Draft: 'border-slate-200 bg-slate-100 text-slate-700',
  Pending: 'border-amber-200 bg-amber-100 text-amber-900',
  Paid: 'border-green-200 bg-green-100 text-green-800',
  Overdue: 'border-red-200 bg-red-100 text-red-800',
}

const DOT_STYLES: Record<InvoiceStatus, string> = {
  Draft: 'bg-slate-500',
  Pending: 'bg-amber-500',
  Paid: 'bg-green-600',
  Overdue: 'bg-red-600',
}

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
  className?: string
}

/** Colour is never the only signal: the status word is always rendered as text. */
export function InvoiceStatusBadge({ status, className }: Readonly<InvoiceStatusBadgeProps>) {
  return (
    <Badge
      variant="outline"
      data-status={status}
      className={cn('gap-1.5 font-medium', STATUS_STYLES[status], className)}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOT_STYLES[status])} />
      {status}
    </Badge>
  )
}
