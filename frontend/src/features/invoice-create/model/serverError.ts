import { HTTP_STATUS, isApiError } from '@/shared/api'
import type { CreateFailure } from './types'

export const FORBIDDEN_MESSAGE = 'You do not have permission to create invoices'

const UNKNOWN_MESSAGE = 'Something went wrong. Please try again.'

/** Turns any error from the create call into what the form should show. */
export function classifyCreateError(error: unknown): CreateFailure {
  if (!isApiError(error)) {
    return { kind: 'banner', messages: [UNKNOWN_MESSAGE] }
  }
  if (error.status === HTTP_STATUS.FORBIDDEN) {
    return { kind: 'forbidden', message: FORBIDDEN_MESSAGE }
  }
  // The other 409 (same Idempotency-Key still running) is not about the number, so it goes to the banner.
  if (error.status === HTTP_STATUS.CONFLICT && error.messages.some((message) => message.toLowerCase().includes('invoice number'))) {
    return { kind: 'invoice-number-taken', message: error.messages[0] }
  }
  return { kind: 'banner', messages: error.messages.length > 0 ? error.messages : [UNKNOWN_MESSAGE] }
}
