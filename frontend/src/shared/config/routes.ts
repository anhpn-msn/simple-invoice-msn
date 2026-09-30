export const REDIRECT_PARAM = 'redirectTo'

/** Router state key under which the list page passes its own URL to the detail page. */
export const LIST_RETURN_STATE_KEY = 'from'

export const routes = {
  root: '/',
  login: '/login',
  invoices: '/invoices',
  invoiceNew: '/invoices/new',
  invoiceDetail: (id: string) => `/invoices/${encodeURIComponent(id)}`,
  loginWithRedirect: (redirectTo: string) => `/login?${REDIRECT_PARAM}=${encodeURIComponent(redirectTo)}`,
} as const

export const routePatterns = {
  root: '/',
  login: 'login',
  invoices: 'invoices',
  invoiceNew: 'invoices/new',
  invoiceDetail: 'invoices/:id',
  notFound: '*',
} as const

export const DEFAULT_AUTHENTICATED_PATH = routes.invoices
