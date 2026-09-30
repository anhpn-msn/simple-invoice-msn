export const NETWORK_ERROR_MESSAGE = 'Network error. Check your connection and try again.'

/** Error thrown for every non-2xx response and for network failures (status 0). */
export class ApiError extends Error {
  readonly status: number
  readonly messages: string[]
  readonly raw: unknown

  constructor(status: number, messages: string[], raw?: unknown) {
    super(messages[0] ?? 'Request failed')
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
    this.raw = raw
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

function toMessages(body: unknown, fallback: string): string[] {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown }
    if (typeof message === 'string' && message.length > 0) {
      return [message]
    }
    if (Array.isArray(message)) {
      const strings = message.filter((item): item is string => typeof item === 'string')
      if (strings.length > 0) {
        return strings
      }
    }
  }
  return [fallback]
}

/** Builds an ApiError from a failed response using the `{ statusCode, message, error }` shape. */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const fallback = response.statusText || `Request failed with status ${response.status}`
  return new ApiError(response.status, toMessages(body, fallback), body)
}
