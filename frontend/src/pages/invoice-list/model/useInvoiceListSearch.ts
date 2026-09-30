import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { isDateRangeInvalid, parseListSearchParams, toListSearchParams } from './list-search'
import type { InvoiceListFilters, UpdateListOptions } from './types'

/** The URL query string is the only store for list state. Any change except `page` goes back to page 1. */
export function useInvoiceListSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseListSearchParams(searchParams), [searchParams])
  const rangeInvalid = isDateRangeInvalid(filters)

  const update = useCallback(
    (patch: Partial<InvoiceListFilters>, options: UpdateListOptions = {}) => {
      setSearchParams(
        (previous) => toListSearchParams({ ...parseListSearchParams(previous), page: 1, ...patch }),
        { replace: options.replace },
      )
    },
    [setSearchParams],
  )

  const reset = useCallback(() => {
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  return { filters, rangeInvalid, update, reset }
}
