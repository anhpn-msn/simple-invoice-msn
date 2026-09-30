import { Skeleton } from '@/shared/ui/skeleton'

export function RouteFallback() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <output aria-label="Loading" className="sr-only">
        Loading
      </output>
      <Skeleton aria-hidden="true" className="h-8 w-48" />
      <Skeleton aria-hidden="true" className="h-64 w-full" />
    </div>
  )
}
