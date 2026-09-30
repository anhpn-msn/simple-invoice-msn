import { redirect, type LoaderFunctionArgs } from 'react-router'
import { ensureSession, hasValidSession } from '@/shared/auth'
import { routes } from '@/shared/config'

/**
 * RequireAuth guard for protected routes. With no valid in-memory token it makes
 * one single-flight refresh; if that fails the user is sent to /login with the
 * original path (validated again by `safeRedirectPath` after sign-in).
 */
export async function requireAuthLoader({ request }: LoaderFunctionArgs): Promise<null> {
  if (await ensureSession()) {
    return null
  }
  const url = new URL(request.url)
  throw redirect(routes.loginWithRedirect(url.pathname + url.search))
}

/** /login is skipped for users who already hold a session. */
export function redirectIfAuthenticatedLoader(): null {
  if (hasValidSession()) {
    throw redirect(routes.invoices)
  }
  return null
}
