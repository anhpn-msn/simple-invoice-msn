import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { accountantSession, errorBody, invoiceDetailFixtures, renderWithProviders, server } from '@/test'
import { InvoiceDetailPage } from './InvoiceDetailPage'

const [overdue, , , jpyPending, , sgdDraft] = invoiceDetailFixtures

function renderDetail(id: string, extra: { route?: string } = {}) {
  return renderWithProviders(<InvoiceDetailPage />, {
    route: extra.route ?? `/invoices/${id}`,
    path: '/invoices/:id',
    session: accountantSession,
    extraRoutes: [{ path: '/invoices', element: <p>List stub</p> }],
  })
}

describe('InvoiceDetailPage', () => {
  it('shows a loading state first', () => {
    renderDetail(overdue.invoiceId)

    expect(screen.getByRole('status')).toHaveTextContent('Loading invoice')
  })

  it('renders info, customer, items and every amount from the API strings', async () => {
    renderDetail(overdue.invoiceId)

    expect(await screen.findByRole('heading', { name: `Invoice ${overdue.invoiceNumber}` })).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('PO-7001')).toBeInTheDocument()
    expect(screen.getByText('03 Jun 2026')).toBeInTheDocument()
    expect(screen.getByText('03 Jul 2026')).toBeInTheDocument()
    expect(screen.getByText('AUD (AU$)')).toBeInTheDocument()
    expect(screen.getByText('Invoice issued to Paul Anderson')).toBeInTheDocument()
    expect(screen.getByText('Paul Anderson')).toBeInTheDocument()
    expect(screen.getByText('paul.anderson@example.com')).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByText('Honda RC150')).toBeInTheDocument()
    expect(within(table).getByText('A$1,000.00')).toBeInTheDocument()

    const amounts = screen.getByRole('heading', { name: 'Amounts' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(amounts).getByText('Subtotal').nextSibling).toHaveTextContent('A$2,000.00')
    expect(within(amounts).getByText('Tax (10%)').nextSibling).toHaveTextContent('A$200.00')
    expect(within(amounts).getByText('Discount').nextSibling).toHaveTextContent('A$20.00')
    expect(within(amounts).getByText('Total').nextSibling).toHaveTextContent('A$2,180.00')
    expect(within(amounts).getByText('Paid').nextSibling).toHaveTextContent('A$1,451.34')
    expect(within(amounts).getByText('Outstanding balance').nextSibling).toHaveTextContent('A$728.66')
  })

  it('renders a 4-decimal rate and totals without rounding them', async () => {
    renderDetail(sgdDraft.invoiceId)

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('SGD 333.30')).toBeInTheDocument()
    expect(screen.getAllByText('SGD 1,099.89').length).toBeGreaterThan(0)
  })

  it('renders JPY amounts as whole numbers', async () => {
    renderDetail(jpyPending.invoiceId)

    expect(await screen.findByText('Pending')).toBeInTheDocument()
    expect(screen.getAllByText('¥330,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('¥230,000').length).toBeGreaterThan(0)
  })

  it('shows placeholders for optional fields that are null', async () => {
    server.use(
      http.get('/api/invoices/:id', () =>
        HttpResponse.json({
          ...overdue,
          invoiceReference: null,
          description: null,
          customer: { ...overdue.customer, mobileNumber: null, address: null },
        }),
      ),
    )
    renderDetail(overdue.invoiceId)

    await screen.findByRole('heading', { name: `Invoice ${overdue.invoiceNumber}` })
    expect(screen.getAllByText('Not provided')).toHaveLength(4)
  })

  it('shows the not found state for an unknown invoice', async () => {
    renderDetail('0190b000-0000-7000-8000-00000000ffff')

    expect(await screen.findByRole('heading', { name: 'Invoice not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to invoices' })).toHaveAttribute('href', '/invoices')
  })

  it('treats an id that is not a UUID (API 400) as not found', async () => {
    renderDetail('nope')

    expect(await screen.findByRole('heading', { name: 'Invoice not found' })).toBeInTheDocument()
  })

  it('shows an error with a retry button that loads the invoice on success', async () => {
    let calls = 0
    server.use(
      http.get('/api/invoices/:id', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json(errorBody(500, 'Internal server error', 'Internal Server Error'), { status: 500 })
          : HttpResponse.json(overdue)
      }),
    )
    const { user } = renderDetail(overdue.invoiceId)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the invoice')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: `Invoice ${overdue.invoiceNumber}` })).toBeInTheDocument()
  })

  it('goes to the list when opened directly (no history to go back to)', async () => {
    const { user, router } = renderDetail(overdue.invoiceId)

    await user.click(await screen.findByRole('link', { name: 'Back to invoices' }))

    expect(router.state.location.pathname).toBe('/invoices')
  })

  it('goes back to the exact list URL the user came from', async () => {
    const { router } = renderDetail(overdue.invoiceId)
    await router.navigate(`/invoices/${overdue.invoiceId}`, { state: { from: '/invoices?status=Paid&page=2' } })

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Back to invoices' })).toHaveAttribute(
        'href',
        '/invoices?status=Paid&page=2',
      ),
    )
  })

  it('ignores a from state that is not a list URL', async () => {
    const { router } = renderDetail(overdue.invoiceId)
    await router.navigate(`/invoices/${overdue.invoiceId}`, { state: { from: 'https://evil.example/invoices' } })

    await waitFor(() => expect(router.state.location.state).toEqual({ from: 'https://evil.example/invoices' }))
    expect(await screen.findByRole('link', { name: 'Back to invoices' })).toHaveAttribute('href', '/invoices')
  })
})
