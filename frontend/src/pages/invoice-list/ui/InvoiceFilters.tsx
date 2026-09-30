import { ArrowDown, ArrowUp, RotateCcw, Search } from 'lucide-react'
import {
  INVOICE_FIELD_LIMITS,
  INVOICE_SORT_FIELDS,
  INVOICE_STATUSES,
  type InvoiceSortBy,
  type InvoiceStatus,
} from '@/entities/invoice'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { SORT_LABELS } from '../model/constants'
import type { InvoiceListFilters } from '../model/types'

const ALL = 'all'

interface InvoiceFiltersProps {
  filters: InvoiceListFilters
  keyword: string
  onKeywordChange: (value: string) => void
  onChange: (patch: Partial<InvoiceListFilters>) => void
  onReset: () => void
  canReset: boolean
  rangeInvalid: boolean
}

export function InvoiceFilters({
  filters,
  keyword,
  onKeywordChange,
  onChange,
  onReset,
  canReset,
  rangeInvalid,
}: Readonly<InvoiceFiltersProps>) {
  const descending = filters.ordering === 'DESC'
  const DirectionIcon = descending ? ArrowDown : ArrowUp

  return (
    <section aria-label="Filters" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
      <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
        <Label htmlFor="invoice-keyword">Search</Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            id="invoice-keyword"
            type="search"
            value={keyword}
            maxLength={INVOICE_FIELD_LIMITS.keyword}
            placeholder="Invoice number or customer"
            autoComplete="off"
            className="pl-8"
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5 lg:col-span-2">
        <Label htmlFor="invoice-status">Status</Label>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) => onChange({ status: value === ALL ? undefined : (value as InvoiceStatus) })}
        >
          <SelectTrigger id="invoice-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {INVOICE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5 lg:col-span-3">
        <Label htmlFor="invoice-sort">Sort by</Label>
        <div className="flex gap-2">
          <Select value={filters.sortBy} onValueChange={(value) => onChange({ sortBy: value as InvoiceSortBy })}>
            <SelectTrigger id="invoice-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_SORT_FIELDS.map((field) => (
                <SelectItem key={field} value={field}>
                  {SORT_LABELS[field]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Sort direction: ${descending ? 'descending' : 'ascending'}`}
            title={descending ? 'Descending, click for ascending' : 'Ascending, click for descending'}
            onClick={() => onChange({ ordering: descending ? 'ASC' : 'DESC' })}
          >
            <DirectionIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-1.5 lg:col-span-3">
        <Label htmlFor="invoice-from">From date</Label>
        <Input
          id="invoice-from"
          type="date"
          value={filters.fromDate ?? ''}
          max={filters.toDate}
          aria-invalid={rangeInvalid || undefined}
          aria-describedby={rangeInvalid ? 'invoice-range-error' : undefined}
          onChange={(event) => onChange({ fromDate: event.target.value || undefined })}
        />
      </div>

      <div className="grid gap-1.5 lg:col-span-3">
        <Label htmlFor="invoice-to">To date</Label>
        <Input
          id="invoice-to"
          type="date"
          value={filters.toDate ?? ''}
          min={filters.fromDate}
          aria-invalid={rangeInvalid || undefined}
          aria-describedby={rangeInvalid ? 'invoice-range-error' : undefined}
          onChange={(event) => onChange({ toDate: event.target.value || undefined })}
        />
      </div>

      <div className="flex items-end lg:col-span-3">
        <Button type="button" variant="ghost" disabled={!canReset} onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          Reset filters
        </Button>
      </div>

      {rangeInvalid ? (
        <p id="invoice-range-error" role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-12">
          From date must be on or before To date.
        </p>
      ) : null}
    </section>
  )
}
