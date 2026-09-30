import { render, screen } from '@testing-library/react'
import type { InvoiceStatus } from '../model/constants'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'

const cases: [InvoiceStatus, string][] = [
  ['Draft', 'slate'],
  ['Pending', 'amber'],
  ['Paid', 'green'],
  ['Overdue', 'red'],
]

describe('InvoiceStatusBadge', () => {
  it.each(cases)('renders the %s status as text with a %s colour', (status, colour) => {
    render(<InvoiceStatusBadge status={status} />)

    const badge = screen.getByText(status)
    expect(badge).toBeVisible()
    expect(badge.className).toContain(colour)
    expect(badge).toHaveAttribute('data-status', status)
  })
})
