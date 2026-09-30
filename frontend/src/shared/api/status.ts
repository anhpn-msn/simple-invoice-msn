export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
} as const

/** `ApiError.status` when no response arrived at all (offline, DNS, CORS). */
export const NETWORK_ERROR_STATUS = 0

/** True for 4xx. These are deterministic, so repeating the same request cannot help. */
export function isClientError(status: number): boolean {
  return status >= HTTP_STATUS.BAD_REQUEST && status < 500
}
