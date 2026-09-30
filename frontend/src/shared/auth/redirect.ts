import { DEFAULT_AUTHENTICATED_PATH } from '@/shared/config'

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i)
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      return true
    }
  }
  return false
}

/**
 * Accepts only same-origin absolute paths. Rejects `//host`, `/\host`, any
 * backslash and control characters (browsers strip tabs/newlines, which can
 * turn `/\t/evil.com` into `//evil.com`). Anything else falls back to /invoices.
 */
export function safeRedirectPath(input: string | null | undefined): string {
  if (
    typeof input !== 'string' ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('\\') ||
    hasControlChars(input)
  ) {
    return DEFAULT_AUTHENTICATED_PATH
  }
  return input
}
