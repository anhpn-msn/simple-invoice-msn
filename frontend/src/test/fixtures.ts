import type { AuthUser, LoginResponse } from '@/shared/auth'
import type { InvoiceDetail, InvoiceSummary } from '@/entities/invoice'
import type { SeedInvoice } from './types'

export const TEST_ACCESS_TOKEN = 'test-access-token'
export const TEST_PASSWORD = 'test-password-1'

export const accountantUser: AuthUser = {
  id: '0190a1b2-0000-7000-8000-000000000001',
  email: 'demo@example.com',
  fullname: 'Demo Accountant',
  role: 'ACCOUNTANT',
  permissions: ['invoice:read', 'invoice:create'],
}

export const auditorUser: AuthUser = {
  id: '0190a1b2-0000-7000-8000-000000000002',
  email: 'auditor@example.com',
  fullname: 'Demo Auditor',
  role: 'AUDITOR',
  permissions: ['invoice:read'],
}

export function makeLoginResponse(user: AuthUser = accountantUser, accessToken: string = TEST_ACCESS_TOKEN): LoginResponse {
  return { accessToken, tokenType: 'Bearer', expiresIn: 3600, user }
}

export const accountantSession = makeLoginResponse(accountantUser)
export const auditorSession = makeLoginResponse(auditorUser)

const seeds: SeedInvoice[] = [
  { n: 1, customer: 'Paul Anderson', status: 'Overdue', currency: 'AUD', symbol: 'AU$', invoiceDate: '2026-06-03', dueDate: '2026-07-03', sub: '2000.00', tax: '200.00', discount: '20.00', total: '2180.00', paid: '1451.34', balance: '728.66', quantity: 2, rate: '1000.00', itemName: 'Honda RC150' },
  { n: 2, customer: 'Kanglee Trading', status: 'Paid', currency: 'USD', symbol: 'US$', invoiceDate: '2026-07-10', dueDate: '2026-08-09', sub: '1500.00', tax: '150.00', discount: '0.00', total: '1650.00', paid: '1650.00', balance: '0.00', quantity: 3, rate: '500.00', itemName: 'Design retainer' },
  { n: 3, customer: 'Jane Doe', status: 'Pending', currency: 'AUD', symbol: 'AU$', invoiceDate: '2026-09-15', dueDate: '2026-12-15', sub: '1500.00', tax: '150.00', discount: '0.00', total: '1650.00', paid: '0.00', balance: '1650.00', quantity: 10, rate: '150.00', itemName: 'Consulting hours' },
  { n: 4, customer: 'Sakura Holdings', status: 'Pending', currency: 'JPY', symbol: '¥', invoiceDate: '2026-09-01', dueDate: '2026-11-30', sub: '300000', tax: '30000', discount: '0', total: '330000', paid: '100000', balance: '230000', quantity: 6, rate: '50000', itemName: 'Site survey' },
  { n: 5, customer: 'Mekong Foods', status: 'Draft', currency: 'VND', symbol: '₫', invoiceDate: '2026-09-20', dueDate: '2026-12-20', sub: '12000000', tax: '1200000', discount: '200000', total: '13000000', paid: '0', balance: '13000000', quantity: 4, rate: '3000000', itemName: 'Packaging supply' },
  { n: 6, customer: 'Lion City Logistics', status: 'Draft', currency: 'SGD', symbol: 'S$', invoiceDate: '2026-09-25', dueDate: '2026-10-25', sub: '999.90', tax: '99.99', discount: '0.00', total: '1099.89', paid: '0.00', balance: '1099.89', quantity: 3, rate: '333.3000', itemName: 'Freight handling' },
  { n: 7, customer: 'Thames Partners', status: 'Overdue', currency: 'GBP', symbol: '£', invoiceDate: '2026-05-01', dueDate: '2026-05-31', sub: '4800.00', tax: '480.00', discount: '80.00', total: '5200.00', paid: '0.00', balance: '5200.00', quantity: 8, rate: '600.00', itemName: 'Audit support' },
  { n: 8, customer: 'Rhine Engineering', status: 'Paid', currency: 'EUR', symbol: '€', invoiceDate: '2026-04-12', dueDate: '2026-05-12', sub: '2500.00', tax: '250.00', discount: '0.00', total: '2750.00', paid: '2750.00', balance: '0.00', quantity: 5, rate: '500.00', itemName: 'Engineering review' },
  { n: 9, customer: 'Paul Anderson', status: 'Pending', currency: 'AUD', symbol: 'AU$', invoiceDate: '2026-09-28', dueDate: '2026-10-28', sub: '750.00', tax: '75.00', discount: '0.00', total: '825.00', paid: '0.00', balance: '825.00', quantity: 5, rate: '150.00', itemName: 'Workshop' },
  { n: 10, customer: 'Harbour Cafe', status: 'Paid', currency: 'AUD', symbol: 'AU$', invoiceDate: '2026-08-02', dueDate: '2026-09-01', sub: '320.00', tax: '32.00', discount: '0.00', total: '352.00', paid: '352.00', balance: '0.00', quantity: 16, rate: '20.00', itemName: 'Catering trays' },
  { n: 11, customer: 'Blue Ridge Media', status: 'Overdue', currency: 'USD', symbol: 'US$', invoiceDate: '2026-06-20', dueDate: '2026-07-20', sub: '8000.00', tax: '800.00', discount: '0.00', total: '8800.00', paid: '2000.00', balance: '6800.00', quantity: 4, rate: '2000.00', itemName: 'Campaign production' },
  { n: 12, customer: 'Jane Doe', status: 'Draft', currency: 'AUD', symbol: 'AU$', invoiceDate: '2026-09-29', dueDate: '2026-10-29', sub: '90.00', tax: '9.00', discount: '0.00', total: '99.00', paid: '0.00', balance: '99.00', quantity: 1, rate: '90.00', itemName: 'Support call' },
]

function invoiceId(n: number): string {
  return `0190b000-0000-7000-8000-${String(n).padStart(12, '0')}`
}

function toDetail(seed: SeedInvoice): InvoiceDetail {
  const slug = seed.customer.toLowerCase().replace(/[^a-z]+/g, '.')
  return {
    invoiceId: invoiceId(seed.n),
    invoiceNumber: `IV-2026-${String(seed.n).padStart(4, '0')}`,
    invoiceReference: `PO-${7000 + seed.n}`,
    invoiceDate: seed.invoiceDate,
    dueDate: seed.dueDate,
    currency: seed.currency,
    currencySymbol: seed.symbol,
    description: `Invoice issued to ${seed.customer}`,
    status: seed.status,
    customer: {
      fullname: seed.customer,
      email: `${slug}@example.com`,
      mobileNumber: '+61 400 000 000',
      address: 'Sydney',
    },
    items: [
      {
        id: `0190c000-0000-7000-8000-${String(seed.n).padStart(12, '0')}`,
        name: seed.itemName,
        quantity: seed.quantity,
        rate: seed.rate,
      },
    ],
    taxRate: '10.00',
    invoiceSubTotal: seed.sub,
    totalTax: seed.tax,
    totalDiscount: seed.discount,
    totalAmount: seed.total,
    totalPaid: seed.paid,
    balanceAmount: seed.balance,
    createdAt: `${seed.invoiceDate}T02:03:26.995Z`,
    createdBy: accountantUser.id,
  }
}

export const invoiceDetailFixtures: InvoiceDetail[] = seeds.map(toDetail)

export function toInvoiceSummary(detail: InvoiceDetail): InvoiceSummary {
  return {
    invoiceId: detail.invoiceId,
    invoiceNumber: detail.invoiceNumber,
    customerName: detail.customer.fullname,
    invoiceDate: detail.invoiceDate,
    dueDate: detail.dueDate,
    currency: detail.currency,
    currencySymbol: detail.currencySymbol,
    totalAmount: detail.totalAmount,
    balanceAmount: detail.balanceAmount,
    status: detail.status,
  }
}

export const invoiceSummaryFixtures: InvoiceSummary[] = invoiceDetailFixtures.map(toInvoiceSummary)
