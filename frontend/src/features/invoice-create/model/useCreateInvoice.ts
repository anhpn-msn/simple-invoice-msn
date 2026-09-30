import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { toast } from 'sonner'
import { createInvoice, invoiceKeys } from '@/entities/invoice'
import { newIdempotencyKey } from './idempotency-key'
import type { InvoiceFormValues } from './schema'
import { toCreateInvoiceRequest } from './toRequest'

/**
 * One Idempotency-Key per exact request body: a retry of the same body replays on the
 * server, while an edited body is a new operation. Reusing the old key for an edited body
 * would get a 422; if the first attempt did land, the unique invoice number still stops a duplicate.
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient()
  const lastAttempt = useRef<{ key: string; body: string } | null>(null)

  return useMutation({
    mutationFn: (values: InvoiceFormValues) => {
      const request = toCreateInvoiceRequest(values)
      const body = JSON.stringify(request)
      if (lastAttempt.current?.body !== body) {
        lastAttempt.current = { key: newIdempotencyKey(), body }
      }
      return createInvoice(request, lastAttempt.current.key)
    },
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() })
      toast.success(`Invoice ${invoice.invoiceNumber} created`)
    },
  })
}
