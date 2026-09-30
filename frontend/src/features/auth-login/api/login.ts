import { api, HTTP_STATUS, isApiError, NETWORK_ERROR_MESSAGE, NETWORK_ERROR_STATUS } from '@/shared/api'
import type { LoginResponse } from '@/shared/auth'
import { API_PATHS } from '@/shared/config'
import type { LoginFormValues } from '../model/schema'

export function login(credentials: LoginFormValues): Promise<LoginResponse> {
  return api.post<LoginResponse>(API_PATHS.login, credentials)
}

/** Fixed user-facing texts: the server message is never echoed, so a 401 stays generic. */
export function loginErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === HTTP_STATUS.UNAUTHORIZED) return 'Invalid email or password'
    if (error.status === HTTP_STATUS.TOO_MANY_REQUESTS) return 'Too many attempts, try again later'
    if (error.status === NETWORK_ERROR_STATUS) return error.messages[0] ?? NETWORK_ERROR_MESSAGE
  }
  return 'Something went wrong. Please try again.'
}
