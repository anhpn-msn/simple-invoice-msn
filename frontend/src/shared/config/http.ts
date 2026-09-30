const HEADER_REQUESTED_WITH = 'X-Requested-With'
export const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key'
export const JSON_MEDIA_TYPE = 'application/json'

const REQUESTED_WITH_VALUE = 'SimpleInvoice'

/** Custom header the backend requires on cookie endpoints (CSRF defence, forces a CORS preflight). */
export const AUTH_REQUEST_HEADERS = { [HEADER_REQUESTED_WITH]: REQUESTED_WITH_VALUE } as const

/** Paths below `env.apiBaseUrl`. Everything under the auth prefix works with the refresh cookie. */
export const AUTH_PATH_PREFIX = '/auth/'

export const API_PATHS = {
  login: `${AUTH_PATH_PREFIX}login`,
  refresh: `${AUTH_PATH_PREFIX}refresh`,
  logout: `${AUTH_PATH_PREFIX}logout`,
  invoices: '/invoices',
  invoice: (id: string) => `/invoices/${encodeURIComponent(id)}`,
} as const
