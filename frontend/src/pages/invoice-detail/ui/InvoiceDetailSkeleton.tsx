import { Skeleton } from '@/shared/ui/skeleton'

export function InvoiceDetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <output className="sr-only">Loading invoice</output>
      <Skeleton aria-hidden="true" className="h-8 w-64" />
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton aria-hidden="true" className="h-40" />
      <Skeleton aria-hidden="true" className="h-48" />
    </div>
  )
}
