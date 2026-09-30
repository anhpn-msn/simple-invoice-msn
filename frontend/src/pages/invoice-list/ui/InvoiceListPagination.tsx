import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Paging } from '@/entities/invoice'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { PAGE_SIZES, type PageSize } from '../model/constants'

interface InvoiceListPaginationProps {
  paging: Paging
  rowCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
}

export function InvoiceListPagination({ paging, rowCount, onPageChange, onPageSizeChange }: Readonly<InvoiceListPaginationProps>) {
  const totalPages = Math.max(1, Math.ceil(paging.total / paging.pageSize))
  const from = (paging.page - 1) * paging.pageSize + 1
  const to = from + rowCount - 1

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Showing {from} to {to} of {paging.total}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="invoice-page-size" className="whitespace-nowrap">
            Rows per page
          </Label>
          <Select
            value={String(paging.pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
          >
            <SelectTrigger id="invoice-page-size" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav aria-label="Pagination" className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={paging.page <= 1}
            onClick={() => onPageChange(paging.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <span className="text-sm whitespace-nowrap">
            Page {paging.page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={paging.page >= totalPages}
            onClick={() => onPageChange(paging.page + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  )
}
