import { http, HttpResponse } from 'msw'
import { setSession } from '@/shared/auth'
import { accountantSession, invoiceDetailFixtures, server } from '@/test'
import type { CreateInvoiceRequest } from '../model/types'
import { createInvoice, fetchInvoice, fetchInvoices } from './invoices'

beforeEach(() => {
  setSession(accountantSession)
})

describe('fetchInvoices', () => {
  it('omits empty params and serializes the rest', async () => {
    let search = ''
    server.use(
      http.get('/api/invoices', ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json({ data: [], paging: { page: 1, pageSize: 10, total: 0 } })
      }),
    )

    await fetchInvoices({
      page: 2,
      pageSize: 20,
      sortBy: 'dueDate',
      ordering: 'ASC',
      status: undefined,
      keyword: '',
      fromDate: undefined,
      toDate: '2026-09-30',
    })

    expect(new URLSearchParams(search).toString()).toBe('page=2&pageSize=20&sortBy=dueDate&ordering=ASC&toDate=2026-09-30')
  })

  it('sends no query string when every param is empty', async () => {
    let search: string | null = null
    server.use(
      http.get('/api/invoices', ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json({ data: [], paging: { page: 1, pageSize: 10, total: 0 } })
      }),
    )

    await fetchInvoices({ keyword: '   ', status: undefined })

    expect(search).toBe('')
  })

  it('returns the paged response with money as strings', async () => {
    const result = await fetchInvoices({ pageSize: 5, status: 'Paid' })

    expect(result.paging.total).toBe(3)
    expect(result.data.every((row) => row.status === 'Paid')).toBe(true)
    expect(typeof result.data[0]?.totalAmount).toBe('string')
  })
})

describe('fetchInvoice', () => {
  it('fetches one invoice by id', async () => {
    const expected = invoiceDetailFixtures[0]
    if (!expected) throw new Error('fixture missing')

    const invoice = await fetchInvoice(expected.invoiceId)

    expect(invoice.invoiceNumber).toBe(expected.invoiceNumber)
    expect(invoice.balanceAmount).toBe('728.66')
  })

  it('rejects with a typed 404 error', async () => {
    await expect(fetchInvoice('0190b000-0000-7000-8000-999999999999')).rejects.toMatchObject({
      status: 404,
      messages: ['Invoice not found'],
    })
  })
})

describe('createInvoice', () => {
  const body: CreateInvoiceRequest = {
    invoiceNumber: 'IV-NEW-1',
    invoiceDate: '2026-09-30',
    dueDate: '2026-10-30',
    currency: 'AUD',
    customer: { fullname: 'Jane Doe', email: 'jane@example.com' },
    items: [{ name: 'Consulting hours', quantity: 10, rate: '150.00' }],
    taxRate: '10',
    discount: '0',
  }

  it('posts the body with the Idempotency-Key header', async () => {
    let key: string | null = null
    let received: unknown
    server.use(
      http.post('/api/invoices', async ({ request }) => {
        key = request.headers.get('idempotency-key')
        received = await request.json()
        return HttpResponse.json(invoiceDetailFixtures[0], { status: 201 })
      }),
    )

    await createInvoice(body, 'key-123')

    expect(key).toBe('key-123')
    expect(received).toEqual(body)
  })

  it('surfaces a 409 duplicate invoice number', async () => {
    await expect(createInvoice({ ...body, invoiceNumber: 'IV-2026-0001' }, 'k')).rejects.toMatchObject({ status: 409 })
  })

  it('creates a Draft with server-calculated totals via the default handlers', async () => {
    const created = await createInvoice(body, 'key-abc')

    expect(created.status).toBe('Draft')
    expect(created.totalAmount).toBe('1650.00')
    expect(created.invoiceSubTotal).toBe('1500.00')
  })
})
