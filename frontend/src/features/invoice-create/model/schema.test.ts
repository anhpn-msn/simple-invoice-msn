import { buildDefaultValues, addDays } from './defaults'
import { invoiceFormSchema, type InvoiceFormValues } from './schema'
import { toCreateInvoiceRequest } from './toRequest'

function valid(overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues {
  return {
    ...buildDefaultValues('2026-09-30'),
    customerFullname: 'Jane Doe',
    customerEmail: 'jane@example.com',
    invoiceNumber: 'IV-2026-0001',
    itemName: 'Consulting hours',
    itemQuantity: '10',
    itemRate: '150.00',
    ...overrides,
  }
}

function messagesFor(values: InvoiceFormValues): Record<string, string> {
  const result = invoiceFormSchema.safeParse(values)
  if (result.success) {
    return {}
  }
  const first: Record<string, string> = {}
  for (const issue of result.error.issues) {
    first[String(issue.path[0])] ??= issue.message
  }
  return first
}

describe('invoiceFormSchema', () => {
  it('accepts a complete valid form and the defaults', () => {
    expect(messagesFor(valid())).toEqual({})
    expect(buildDefaultValues('2026-09-30')).toMatchObject({
      invoiceDate: '2026-09-30',
      dueDate: '2026-10-30',
      taxRate: '10',
      discount: '0',
      currency: 'AUD',
    })
  })

  it('reports every required field', () => {
    const errors = messagesFor(
      valid({ customerFullname: ' ', customerEmail: '', invoiceNumber: '', itemName: '', itemQuantity: '', itemRate: '' }),
    )
    expect(errors).toMatchObject({
      customerFullname: 'Customer name is required',
      customerEmail: 'Email is required',
      invoiceNumber: 'Invoice number is required',
      itemName: 'Item name is required',
      itemQuantity: 'Quantity is required',
      itemRate: 'Rate is required',
    })
  })

  it('checks the due date rule even when other fields are invalid', () => {
    const errors = messagesFor(valid({ dueDate: '2026-09-29', customerEmail: 'nope' }))
    expect(errors.dueDate).toBe('Due date must be on or after invoice date')
    expect(errors.customerEmail).toBe('Enter a valid email address')
  })

  it('allows due date equal to invoice date and rejects impossible dates', () => {
    expect(messagesFor(valid({ dueDate: '2026-09-30' }))).toEqual({})
    expect(messagesFor(valid({ invoiceDate: '2026-02-30' })).invoiceDate).toBe('Invoice date must be a valid date')
    expect(messagesFor(valid({ dueDate: '' })).dueDate).toBe('Due date is required')
  })

  it.each([
    ['0.12345', 'Rate must be a number with at most 4 decimals'],
    ['-5', 'Rate must be a number with at most 4 decimals'],
    ['1e3', 'Rate must be a number with at most 4 decimals'],
    ['abc', 'Rate must be a number with at most 4 decimals'],
    ['0', 'Rate must be greater than 0'],
    ['0.0000', 'Rate must be greater than 0'],
    ['1000000000', 'Rate must not exceed 999999999.9999'],
  ])('rejects rate %s', (rate, message) => {
    expect(messagesFor(valid({ itemRate: rate })).itemRate).toBe(message)
  })

  it.each(['0.0001', '150', '150.5', '999999999.9999', '007'])('accepts rate %s', (rate) => {
    expect(messagesFor(valid({ itemRate: rate })).itemRate).toBeUndefined()
  })

  it.each(['0', '100001', '1.5', '-1', '1e2', '1234567'])('rejects quantity %s', (quantity) => {
    expect(messagesFor(valid({ itemQuantity: quantity })).itemQuantity).toBeDefined()
  })

  it.each(['1', '100000'])('accepts quantity %s', (quantity) => {
    expect(messagesFor(valid({ itemQuantity: quantity })).itemQuantity).toBeUndefined()
  })

  it.each(['100.01', '101', '1.234', '-1', 'x'])('rejects tax rate %s', (taxRate) => {
    expect(messagesFor(valid({ taxRate })).taxRate).toBeDefined()
  })

  it.each(['', '0', '10', '7.5', '100', '100.00', '19.99'])('accepts tax rate "%s"', (taxRate) => {
    expect(messagesFor(valid({ taxRate })).taxRate).toBeUndefined()
  })

  it('limits discount decimals by currency', () => {
    expect(messagesFor(valid({ discount: '20.555' })).discount).toBe('Discount must be a number with at most 2 decimals')
    expect(messagesFor(valid({ discount: '20.55' })).discount).toBeUndefined()
    expect(messagesFor(valid({ currency: 'JPY', discount: '20.5' })).discount).toBe('Discount must be a whole number for JPY')
    expect(messagesFor(valid({ currency: 'VND', discount: '20' })).discount).toBeUndefined()
    expect(messagesFor(valid({ discount: '-1' })).discount).toBeDefined()
  })

  it('validates customer and invoice text fields', () => {
    expect(messagesFor(valid({ customerMobileNumber: 'abc' })).customerMobileNumber).toBeDefined()
    expect(messagesFor(valid({ customerMobileNumber: '+61 400 000 000' })).customerMobileNumber).toBeUndefined()
    expect(messagesFor(valid({ invoiceNumber: '-bad' })).invoiceNumber).toBeDefined()
    expect(messagesFor(valid({ invoiceNumber: 'a'.repeat(51) })).invoiceNumber).toBe('Use at most 50 characters')
    expect(messagesFor(valid({ customerAddress: 'x'.repeat(501) })).customerAddress).toBeDefined()
    expect(messagesFor(valid({ description: 'x'.repeat(1001) })).description).toBeDefined()
    expect(messagesFor(valid({ invoiceReference: 'x'.repeat(101) })).invoiceReference).toBeDefined()
  })
})

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-15', 30)).toBe('2027-01-14')
    expect(addDays('2028-02-01', 30)).toBe('2028-03-02')
  })
})

describe('toCreateInvoiceRequest', () => {
  it('keeps money as strings, sends quantity as an integer and drops empty optionals', () => {
    const body = toCreateInvoiceRequest(valid({ customerFullname: '  Jane Doe ', taxRate: '', discount: '' }))
    expect(body).toEqual({
      invoiceNumber: 'IV-2026-0001',
      invoiceReference: undefined,
      invoiceDate: '2026-09-30',
      dueDate: '2026-10-30',
      currency: 'AUD',
      description: undefined,
      customer: { fullname: 'Jane Doe', email: 'jane@example.com', mobileNumber: undefined, address: undefined },
      items: [{ name: 'Consulting hours', quantity: 10, rate: '150.00' }],
      taxRate: undefined,
      discount: undefined,
    })
  })
})
