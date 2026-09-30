import type { RouteObject } from 'react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { InvoiceDetail, InvoiceStatus } from '@/entities/invoice'
import type { AuthUser, LoginResponse } from '@/shared/auth'

export interface ApiHandlerOptions {
  /** User returned by login/refresh/me and used for the create permission check. */
  user?: AuthUser
  /** Backing data for the invoice endpoints (detail objects; summaries are derived). */
  invoices?: InvoiceDetail[]
  /** Whether a refresh cookie exists at the start. Login sets it, logout clears it. */
  refreshCookie?: boolean
}

export interface RenderWithProvidersOptions {
  /** Initial URL, including search params, e.g. `/invoices?status=Paid`. Default `/`. */
  route?: string
  /** Route pattern the `ui` element is mounted on, e.g. `/invoices/:id`. Default `*`. */
  path?: string
  /** Signed-in session to seed before render (`accountantSession`, `auditorSession`). Default: signed out. */
  session?: LoginResponse | null
  /** Extra sibling routes, useful to assert navigation targets (e.g. a `/invoices` stub). */
  extraRoutes?: RouteObject[]
  queryClient?: QueryClient
}

export interface RenderAppOptions {
  session?: LoginResponse | null
}

export interface SeedInvoice {
  n: number
  customer: string
  status: InvoiceStatus
  currency: string
  symbol: string
  invoiceDate: string
  dueDate: string
  sub: string
  tax: string
  discount: string
  total: string
  paid: string
  balance: string
  quantity: number
  rate: string
  itemName: string
}
