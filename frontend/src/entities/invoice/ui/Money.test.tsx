import { render, screen } from '@testing-library/react'
import { Money } from './Money'

describe('Money', () => {
  it('renders a decimal string with its currency', () => {
    render(<Money amount="2180.00" currency="AUD" />)

    expect(screen.getByText('A$2,180.00')).toBeInTheDocument()
  })

  it('renders zero-decimal currencies without a fraction', () => {
    render(<Money amount="330000" currency="JPY" />)

    expect(screen.getByText('¥330,000')).toBeInTheDocument()
  })
})
