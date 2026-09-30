import { ApiError } from '@/shared/api'
import { classifyCreateError } from './serverError'

describe('classifyCreateError', () => {
  it('maps a duplicate invoice number to the field', () => {
    expect(classifyCreateError(new ApiError(409, ['Invoice number already exists']))).toEqual({
      kind: 'invoice-number-taken',
      message: 'Invoice number already exists',
    })
  })

  it('shows the in-flight idempotency conflict in the banner, not on the number', () => {
    const failure = classifyCreateError(new ApiError(409, ['A request with this Idempotency-Key is being processed']))
    expect(failure).toEqual({ kind: 'banner', messages: ['A request with this Idempotency-Key is being processed'] })
  })

  it('maps 403 to the permission message', () => {
    expect(classifyCreateError(new ApiError(403, ['Forbidden resource']))).toEqual({
      kind: 'forbidden',
      message: 'You do not have permission to create invoices',
    })
  })

  it('keeps every server message for 400', () => {
    const failure = classifyCreateError(new ApiError(400, ['discount must not exceed subTotal', 'other']))
    expect(failure).toEqual({ kind: 'banner', messages: ['discount must not exceed subTotal', 'other'] })
  })

  it('falls back for unknown errors', () => {
    expect(classifyCreateError(new Error('boom'))).toEqual({
      kind: 'banner',
      messages: ['Something went wrong. Please try again.'],
    })
  })
})
