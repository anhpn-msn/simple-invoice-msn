import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { invoiceKeys } from '@/entities/invoice'
import { accountantSession, errorBody, invoiceDetailFixtures, renderWithProviders, server } from '@/test'
import { InvoiceForm } from './InvoiceForm'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const view = renderWithProviders(<InvoiceForm onCreated={onCreated} onCancel={onCancel} />, {
    session: accountantSession,
  })
  return { ...view, onCreated, onCancel }
}

type User = ReturnType<typeof renderForm>['user']

async function fillValidForm(user: User, invoiceNumber = 'IV-2026-9001') {
  await user.type(screen.getByLabelText('Customer name'), 'Jane Doe')
  await user.type(screen.getByLabelText('Customer email'), 'Jane@Example.com')
  await user.type(screen.getByLabelText('Invoice number'), invoiceNumber)
  fireEvent.change(screen.getByLabelText('Invoice date'), { target: { value: '2026-09-30' } })
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-30' } })
  await user.type(screen.getByLabelText('Item name'), 'Consulting hours')
  await user.clear(screen.getByLabelText('Quantity'))
  await user.type(screen.getByLabelText('Quantity'), '10')
  await user.type(screen.getByLabelText('Rate'), '150.00')
}

const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Create invoice' }))

describe('InvoiceForm', () => {
  it('shows required field errors and does not call the API', async () => {
    let calls = 0
    server.use(
      http.post('/api/invoices', () => {
        calls += 1
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const { user } = renderForm()

    await submit(user)

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Invoice number is required')).toBeInTheDocument()
    expect(screen.getByText('Item name is required')).toBeInTheDocument()
    expect(screen.getByText('Rate is required')).toBeInTheDocument()
    const name = screen.getByLabelText('Customer name')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Customer name is required')
    expect(calls).toBe(0)
  })

  it('shows the due date rule when the due date is before the invoice date', async () => {
    const { user } = renderForm()
    fireEvent.change(screen.getByLabelText('Invoice date'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-09-29' } })

    await submit(user)

    expect(await screen.findByText('Due date must be on or after invoice date')).toBeInTheDocument()
  })

  it('rejects a rate with more than 4 decimals', async () => {
    const { user } = renderForm()
    await user.type(screen.getByLabelText('Rate'), '1.23456')

    await submit(user)

    expect(await screen.findByText('Rate must be a number with at most 4 decimals')).toBeInTheDocument()
  })

  it('checks discount decimals against the chosen currency', async () => {
    const { user } = renderForm()
    await user.selectOptions(screen.getByLabelText('Currency'), 'JPY')
    await user.clear(screen.getByLabelText('Discount'))
    await user.type(screen.getByLabelText('Discount'), '5.5')

    await submit(user)

    expect(await screen.findByText('Discount must be a whole number for JPY')).toBeInTheDocument()
  })

  it('sends the exact body with an Idempotency-Key, then toasts and reports the created invoice', async () => {
    let body: unknown
    let key: string | null = null
    server.use(
      http.post('/api/invoices', async ({ request }) => {
        key = request.headers.get('idempotency-key')
        body = await request.clone().json()
        return undefined
      }),
    )
    const { user, onCreated } = renderForm()
    await fillValidForm(user)

    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(body).toEqual({
      invoiceNumber: 'IV-2026-9001',
      invoiceDate: '2026-09-30',
      dueDate: '2026-10-30',
      currency: 'AUD',
      customer: { fullname: 'Jane Doe', email: 'Jane@Example.com' },
      items: [{ name: 'Consulting hours', quantity: 10, rate: '150.00' }],
      taxRate: '10',
      discount: '0',
    })
    expect(key).toMatch(UUID)
    expect(toast.success).toHaveBeenCalledWith('Invoice IV-2026-9001 created')
    expect(onCreated.mock.calls[0][0]).toMatchObject({ invoiceNumber: 'IV-2026-9001', totalAmount: '1650.00' })
  })

  it('invalidates cached invoice lists after a create', async () => {
    const { user, onCreated, queryClient } = renderForm()
    queryClient.setQueryData(invoiceKeys.list({}), { data: [], paging: { page: 1, pageSize: 10, total: 0 } })
    await fillValidForm(user, 'IV-2026-9002')

    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(queryClient.getQueryState(invoiceKeys.list({}))?.isInvalidated).toBe(true)
  })

  it('disables the submit button while the request is pending', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('/api/invoices', async () => {
        await gate
        return HttpResponse.json(errorBody(500, 'Internal server error', 'Internal Server Error'), { status: 500 })
      }),
    )
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)

    expect(await screen.findByRole('button', { name: 'Creating...' })).toBeDisabled()
    release()
    expect(await screen.findByRole('button', { name: 'Create invoice' })).toBeEnabled()
  })

  it('shows a 409 as an inline error on the invoice number', async () => {
    const { user, onCreated } = renderForm()
    await fillValidForm(user, invoiceDetailFixtures[0].invoiceNumber.toLowerCase())

    await submit(user)

    const field = screen.getByLabelText('Invoice number')
    expect(await screen.findByText('Invoice number already exists')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Invoice number already exists')
    expect(field).toHaveFocus()
    expect(onCreated).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('lists the server messages for a 400', async () => {
    server.use(
      http.post('/api/invoices', () =>
        HttpResponse.json(errorBody(400, ['discount must not exceed subTotal'], 'Bad Request'), { status: 400 }),
      ),
    )
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('discount must not exceed subTotal')
  })

  it('shows the permission message for a 403', async () => {
    server.use(
      http.post('/api/invoices', () =>
        HttpResponse.json(errorBody(403, 'Forbidden resource', 'Forbidden'), { status: 403 }),
      ),
    )
    const { user } = renderForm()
    await fillValidForm(user)

    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to create invoices')
  })

  it('reuses the same Idempotency-Key when the user retries after a network error', async () => {
    const keys: (string | null)[] = []
    let attempt = 0
    server.use(
      http.post('/api/invoices', ({ request }) => {
        keys.push(request.headers.get('idempotency-key'))
        attempt += 1
        return attempt === 1
          ? HttpResponse.error()
          : HttpResponse.json(invoiceDetailFixtures[0], { status: 201 })
      }),
    )
    const { user, onCreated } = renderForm()
    await fillValidForm(user)

    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(UUID)
    expect(keys[1]).toBe(keys[0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses a new Idempotency-Key when the user edits the form after a failed attempt', async () => {
    const keys: (string | null)[] = []
    let attempt = 0
    server.use(
      http.post('/api/invoices', ({ request }) => {
        keys.push(request.headers.get('idempotency-key'))
        attempt += 1
        return attempt === 1
          ? HttpResponse.error()
          : HttpResponse.json(invoiceDetailFixtures[0], { status: 201 })
      }),
    )
    const { user, onCreated } = renderForm()
    await fillValidForm(user, 'IV-2026-9101')

    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
    await user.clear(screen.getByLabelText('Rate'))
    await user.type(screen.getByLabelText('Rate'), '175.00')
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(keys).toHaveLength(2)
    expect(keys[1]).toMatch(UUID)
    expect(keys[1]).not.toBe(keys[0])
  })

  it('calls onCancel', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
