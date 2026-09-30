import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test'
import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('explains the error and links back to the invoices', () => {
    renderWithProviders(<NotFoundPage />, { route: '/nope' })

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to invoices' })).toHaveAttribute('href', '/invoices')
  })
})
