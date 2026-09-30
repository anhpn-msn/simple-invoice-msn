import { formatMoney } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'

interface MoneyProps {
  /** Decimal string exactly as returned by the API. */
  amount: string
  currency: string
  locale?: string
  className?: string
}

export function Money({ amount, currency, locale, className }: Readonly<MoneyProps>) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(amount, currency, locale)}</span>
}
