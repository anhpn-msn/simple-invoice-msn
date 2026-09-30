import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { LIST_RETURN_STATE_KEY, routes } from '@/shared/config'

/**
 * The list passes its own URL in the router state, so going back keeps filters, sort and page.
 * History back is not used: after a login redirect it would leave the app.
 * Only list URLs are accepted, so the state cannot turn this into an open redirect.
 */
export function BackToInvoicesLink() {
  const location = useLocation()
  const from: unknown = (location.state as Record<string, unknown> | null)?.[LIST_RETURN_STATE_KEY]
  const isListUrl =
    typeof from === 'string' && (from === routes.invoices || from.startsWith(`${routes.invoices}?`))

  return (
    <Link
      to={isListUrl ? from : routes.invoices}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to invoices
    </Link>
  )
}
