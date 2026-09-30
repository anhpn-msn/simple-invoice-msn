import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import {
  accountantSession,
  auditorSession,
  auditorUser,
  createApiHandlers,
  errorBody,
  renderWithProviders,
  server,
} from '@/test'
import { InvoiceListPage } from './InvoiceListPage'

function setViewport(desktop: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: desktop,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList
}

function trackRequests() {
  const urls: URL[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname === '/api/invoices') urls.push(url)
  })
  return urls
}

function renderList(route = '/invoices', session = accountantSession) {
  return renderWithProviders(<InvoiceListPage />, { route, path: '/invoices', session })
}

function searchOf(router: ReturnType<typeof renderList>['router']) {
  return new URLSearchParams(router.state.location.search)
}

async function pick(user: ReturnType<typeof renderList>['user'], name: string | RegExp, option: string) {
  await user.click(screen.getByRole('combobox', { name }))
  await user.click(await screen.findByRole('option', { name: option }))
}

beforeEach(() => {
  setViewport(true)
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('InvoiceListPage', () => {
  it('renders the first page of invoices with money from the API strings', async () => {
    renderList()

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(1 + 10)
    const paul = screen.getByRole('link', { name: 'IV-2026-0001' }).closest('tr')!
    expect(within(paul).getByText('Paul Anderson')).toBeInTheDocument()
    expect(within(paul).getByText('A$2,180.00')).toBeInTheDocument()
    expect(within(paul).getByText('A$728.66')).toBeInTheDocument()
    expect(within(paul).getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 to 10 of 12')).toBeInTheDocument()
  })

  it('shows a loading skeleton first', async () => {
    renderList()
    expect(screen.getByRole('status', { name: 'Loading invoices' })).toBeInTheDocument()
    await screen.findAllByRole('row')
  })

  it('reads filters from the URL and sends them to the API', async () => {
    const requests = trackRequests()
    renderList('/invoices?status=Paid&sortBy=totalAmount&ordering=asc&pageSize=20')

    await screen.findByText('Kanglee Trading')
    const last = requests.at(-1)!
    expect(last.searchParams.get('status')).toBe('Paid')
    expect(last.searchParams.get('sortBy')).toBe('totalAmount')
    expect(last.searchParams.get('ordering')).toBe('ASC')
    expect(last.searchParams.get('pageSize')).toBe('20')
  })

  it('ignores invalid URL values instead of sending them', async () => {
    const requests = trackRequests()
    renderList('/invoices?page=-4&pageSize=999&sortBy=hack&status=nope')

    await screen.findAllByRole('row')
    const last = requests.at(-1)!
    expect(last.searchParams.get('page')).toBe('1')
    expect(last.searchParams.get('pageSize')).toBe('10')
    expect(last.searchParams.get('sortBy')).toBe('invoiceDate')
    expect(last.searchParams.has('status')).toBe(false)
  })

  it('updates the URL and the request after the keyword debounce', async () => {
    const requests = trackRequests()
    const { user, router } = renderList()
    await screen.findAllByRole('row')

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'anderson')
    expect(searchOf(router).has('keyword')).toBe(false)
    expect(requests).toHaveLength(1)

    await waitFor(() => expect(searchOf(router).get('keyword')).toBe('anderson'))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1 + 2))
    expect(requests.at(-1)!.searchParams.get('keyword')).toBe('anderson')
    expect(requests.filter((url) => url.searchParams.has('keyword'))).toHaveLength(1)
  })

  it('sends the status and resets to page 1', async () => {
    const requests = trackRequests()
    const { user, router } = renderList('/invoices?pageSize=10&page=2')
    await screen.findByText('Showing 11 to 12 of 12')

    await pick(user, 'Status', 'Overdue')

    await waitFor(() => expect(requests.at(-1)!.searchParams.get('status')).toBe('Overdue'))
    expect(requests.at(-1)!.searchParams.get('page')).toBe('1')
    expect(searchOf(router).get('status')).toBe('Overdue')
    expect(searchOf(router).has('page')).toBe(false)
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1 + 3))
  })

  it('changes the sort field and direction and resets to page 1', async () => {
    const requests = trackRequests()
    const { user, router } = renderList('/invoices?page=2')
    await screen.findByText('Showing 11 to 12 of 12')

    await pick(user, 'Sort by', 'Total amount')
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('sortBy')).toBe('totalAmount'))
    expect(requests.at(-1)!.searchParams.get('page')).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Sort direction: descending' }))
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('ordering')).toBe('ASC'))
    expect(searchOf(router).get('ordering')).toBe('ASC')
    await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('Jane Doe'))
  })

  it('sorts from the column headers and exposes aria-sort', async () => {
    const { user } = renderList()
    await screen.findAllByRole('row')

    const invoiceDate = screen.getByRole('columnheader', { name: 'Invoice date' })
    expect(invoiceDate).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: 'Total amount' })).toHaveAttribute('aria-sort', 'none')

    await user.click(within(invoiceDate).getByRole('button'))
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'Invoice date' })).toHaveAttribute('aria-sort', 'ascending'),
    )

    await user.click(within(screen.getByRole('columnheader', { name: 'Due date' })).getByRole('button'))
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'Due date' })).toHaveAttribute('aria-sort', 'descending'),
    )
    expect(screen.getByRole('columnheader', { name: 'Invoice date' })).toHaveAttribute('aria-sort', 'none')
  })

  it('filters by date range and blocks an inverted range', async () => {
    const requests = trackRequests()
    const { user } = renderList()
    await screen.findAllByRole('row')

    await user.type(screen.getByLabelText('From date'), '2026-09-01')
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('fromDate')).toBe('2026-09-01'))
    await user.type(screen.getByLabelText('To date'), '2026-09-20')
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('toDate')).toBe('2026-09-20'))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1 + 3))

    const before = requests.length
    await user.clear(screen.getByLabelText('To date'))
    await user.type(screen.getByLabelText('To date'), '2026-08-01')
    expect(await screen.findByText('From date must be on or before To date.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(requests.slice(before).some((url) => url.searchParams.get('toDate') === '2026-08-01')).toBe(false)
  })

  it('goes to the next and previous page', async () => {
    const { user, router } = renderList()
    await screen.findByText('Showing 1 to 10 of 12')

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText('Showing 11 to 12 of 12')).toBeInTheDocument()
    expect(searchOf(router).get('page')).toBe('2')
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /previous/i }))
    expect(await screen.findByText('Showing 1 to 10 of 12')).toBeInTheDocument()
    expect(searchOf(router).has('page')).toBe(false)
  })

  it('changes the page size and resets to page 1', async () => {
    const requests = trackRequests()
    const { user } = renderList('/invoices?page=2')
    await screen.findByText('Showing 11 to 12 of 12')

    await pick(user, 'Rows per page', '20')

    await waitFor(() => expect(requests.at(-1)!.searchParams.get('pageSize')).toBe('20'))
    expect(requests.at(-1)!.searchParams.get('page')).toBe('1')
    expect(await screen.findByText('Showing 1 to 12 of 12')).toBeInTheDocument()
  })

  it('resets every filter', async () => {
    const { user, router } = renderList('/invoices?status=Paid&keyword=kang&sortBy=dueDate')
    await screen.findByText('Kanglee Trading')
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('kang')

    await user.click(screen.getByRole('button', { name: 'Reset filters' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1 + 10))
  })

  it('opens the detail page on row click and on Enter', async () => {
    const { user, router } = renderList('/invoices?status=Pending&sortBy=dueDate')
    const first = (await screen.findByRole('link', { name: 'IV-2026-0009' })).closest('tr')!

    await user.click(within(first).getByText('Paul Anderson'))
    expect(router.state.location.pathname).toBe('/invoices/0190b000-0000-7000-8000-000000000009')
    expect(router.state.location.state).toEqual({ from: '/invoices?status=Pending&sortBy=dueDate' })

    await router.navigate('/invoices?status=Pending&sortBy=dueDate')
    const row = (await screen.findByRole('link', { name: 'IV-2026-0003' })).closest('tr')!
    row.focus()
    await user.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/invoices/0190b000-0000-7000-8000-000000000003')
    expect(router.state.location.state).toEqual({ from: '/invoices?status=Pending&sortBy=dueDate' })
  })

  it('shows stacked cards on small screens and passes the list URL to the detail link', async () => {
    setViewport(false)
    const { user, router } = renderList('/invoices?sortBy=totalAmount')

    const links = await screen.findAllByRole('link', { name: /^IV-2026-/ })
    expect(links).toHaveLength(10)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Mekong Foods')

    await user.click(links[0])
    expect(router.state.location.pathname).toMatch(/^\/invoices\/0190b000/)
    expect(router.state.location.state).toEqual({ from: '/invoices?sortBy=totalAmount' })
  })

  it('shows the empty state for a search without results and clears it', async () => {
    const { user } = renderList('/invoices?keyword=zzzz')

    expect(await screen.findByText('No invoices match your filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Showing 1 to 10 of 12')).toBeInTheDocument()
  })

  it('shows a first-page action when the page is past the end', async () => {
    const { user } = renderList('/invoices?page=9')

    expect(await screen.findByText('There are no invoices on this page')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to first page' }))
    expect(await screen.findByText('Showing 1 to 10 of 12')).toBeInTheDocument()
  })

  it('shows an error with a retry that recovers', async () => {
    server.use(
      http.get('/api/invoices', () =>
        HttpResponse.json(errorBody(500, 'Internal server error', 'Internal Server Error'), { status: 500 }),
      ),
    )
    const { user } = renderList()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load invoices')
    expect(alert).toHaveTextContent('Internal server error')

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Showing 1 to 10 of 12')).toBeInTheDocument()
  })

  it('shows New invoice for accountants and hides it for auditors', async () => {
    const accountant = renderList()
    await screen.findAllByRole('row')
    expect(screen.getByRole('link', { name: 'New invoice' })).toHaveAttribute('href', '/invoices/new')
    accountant.unmount()

    server.use(...createApiHandlers({ user: auditorUser }))
    renderList('/invoices', auditorSession)
    await screen.findAllByRole('row')
    expect(screen.queryByRole('link', { name: 'New invoice' })).not.toBeInTheDocument()
  })
})
