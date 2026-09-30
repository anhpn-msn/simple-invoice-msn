import { fireEvent, screen } from '@testing-library/react'
import { accountantSession, auditorSession, renderWithProviders } from '@/test'
import { InvoiceCreatePage } from './InvoiceCreatePage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const options = {
  route: '/invoices/new',
  path: '/invoices/new',
  extraRoutes: [{ path: '/invoices', element: <p>Invoice list stub</p> }],
}

describe('InvoiceCreatePage', () => {
  it('shows the form to users who can create invoices', () => {
    renderWithProviders(<InvoiceCreatePage />, { ...options, session: accountantSession })

    expect(screen.getByRole('heading', { name: 'Create invoice', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Create invoice' })).toBeInTheDocument()
  })

  it('shows a permission message instead of the form for an auditor', () => {
    renderWithProviders(<InvoiceCreatePage />, { ...options, session: auditorSession })

    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission to create invoices')
    expect(screen.queryByRole('form', { name: 'Create invoice' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to invoices' })).toHaveAttribute('href', '/invoices')
  })

  it('goes back to the list after a successful create', async () => {
    const { user, router } = renderWithProviders(<InvoiceCreatePage />, { ...options, session: accountantSession })
    await user.type(screen.getByLabelText('Customer name'), 'Jane Doe')
    await user.type(screen.getByLabelText('Customer email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Invoice number'), 'IV-2026-9100')
    fireEvent.change(screen.getByLabelText('Invoice date'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-30' } })
    await user.type(screen.getByLabelText('Item name'), 'Consulting hours')
    await user.type(screen.getByLabelText('Rate'), '150.00')

    await user.click(screen.getByRole('button', { name: 'Create invoice' }))

    expect(await screen.findByText('Invoice list stub')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/invoices')
  })

  it('goes back to the list on cancel', async () => {
    const { user } = renderWithProviders(<InvoiceCreatePage />, { ...options, session: accountantSession })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('Invoice list stub')).toBeInTheDocument()
  })
})
