import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link } from 'react-router'
import { invoiceListQueryOptions, type InvoiceSortBy } from '@/entities/invoice'
import { PERMISSIONS, useHasPermission } from '@/shared/auth'
import { routes } from '@/shared/config'
import { Button } from '@/shared/ui/button'
import { useMediaQuery } from '../lib/useMediaQuery'
import { DESKTOP_MEDIA_QUERY } from '../model/constants'
import { hasActiveFilters, hasNonDefaultState, toApiParams } from '../model/list-search'
import { useInvoiceListSearch } from '../model/useInvoiceListSearch'
import { useKeywordInput } from '../model/useKeywordInput'
import { InvoiceCards } from './InvoiceCards'
import { InvoiceFilters } from './InvoiceFilters'
import { InvoiceListPagination } from './InvoiceListPagination'
import { InvoiceListEmpty, InvoiceListError, InvoiceListSkeleton } from './InvoiceListStates'
import { InvoiceTable } from './InvoiceTable'

function emptyReason(total: number, filtered: boolean) {
  if (total > 0) {
    return 'page-out-of-range'
  }
  return filtered ? 'filtered' : 'none'
}

export function InvoiceListPage() {
  const { filters, rangeInvalid, update, reset } = useInvoiceListSearch()
  const canCreate = useHasPermission(PERMISSIONS.invoiceCreate)
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const keyword = useKeywordInput(filters.keyword ?? '', (value) => update({ keyword: value || undefined }, { replace: true }))

  const query = useQuery({ ...invoiceListQueryOptions(toApiParams(filters)), enabled: !rangeInvalid })

  function handleSort(field: InvoiceSortBy) {
    if (filters.sortBy === field) {
      update({ ordering: filters.ordering === 'ASC' ? 'DESC' : 'ASC' })
    } else {
      update({ sortBy: field, ordering: 'DESC' })
    }
  }

  function handleReset() {
    keyword.clear()
    reset()
  }

  const result = query.data
  const rows = result?.data ?? []

  function renderResults() {
    if (rangeInvalid) {
      return null
    }
    if (query.isError) {
      return <InvoiceListError error={query.error} onRetry={() => void query.refetch()} />
    }
    if (!result) {
      return <InvoiceListSkeleton />
    }
    if (rows.length === 0) {
      return (
        <InvoiceListEmpty
          reason={emptyReason(result.paging.total, hasActiveFilters(filters))}
          canCreate={canCreate}
          onClearFilters={handleReset}
          onFirstPage={() => update({ page: 1 })}
        />
      )
    }
    return (
      <>
        <div aria-busy={query.isPlaceholderData} className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          {isDesktop ? (
            <InvoiceTable rows={rows} sortBy={filters.sortBy} ordering={filters.ordering} onSort={handleSort} />
          ) : (
            <InvoiceCards rows={rows} />
          )}
        </div>
        <InvoiceListPagination
          paging={result.paging}
          rowCount={rows.length}
          onPageChange={(page) => update({ page })}
          onPageSizeChange={(pageSize) => update({ pageSize })}
        />
      </>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {canCreate ? (
          <Button asChild>
            <Link to={routes.invoiceNew}>
              <Plus aria-hidden="true" />
              New invoice
            </Link>
          </Button>
        ) : null}
      </div>
      <InvoiceFilters
        filters={filters}
        keyword={keyword.value}
        onKeywordChange={keyword.setValue}
        onChange={(patch) => update(patch)}
        onReset={handleReset}
        canReset={hasNonDefaultState(filters) || keyword.value !== ''}
        rangeInvalid={rangeInvalid}
      />
      {renderResults()}
    </div>
  )
}
