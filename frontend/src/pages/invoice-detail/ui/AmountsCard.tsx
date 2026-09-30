import { Money } from '@/entities/invoice'
import type { InvoiceDetail } from '@/entities/invoice'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Separator } from '@/shared/ui/separator'
import { formatRate } from '../lib/formatRate'

interface AmountRowProps {
  label: string
  amount: string
  currency: string
}

function AmountRow({ label, amount, currency }: Readonly<AmountRowProps>) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  )
}

export function AmountsCard({ invoice }: Readonly<{ invoice: InvoiceDetail }>) {
  const { currency } = invoice

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Amounts</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="ml-auto flex max-w-md flex-col gap-2 text-sm">
          <AmountRow label="Subtotal" amount={invoice.invoiceSubTotal} currency={currency} />
          <AmountRow label={`Tax (${formatRate(invoice.taxRate)}%)`} amount={invoice.totalTax} currency={currency} />
          <AmountRow label="Discount" amount={invoice.totalDiscount} currency={currency} />
          <Separator />
          <div className="flex items-baseline justify-between gap-4 font-semibold">
            <dt>Total</dt>
            <dd>
              <Money amount={invoice.totalAmount} currency={currency} />
            </dd>
          </div>
          <AmountRow label="Paid" amount={invoice.totalPaid} currency={currency} />
          <Separator />
          <div className="flex items-baseline justify-between gap-4 rounded-md bg-muted px-3 py-2 text-base font-semibold">
            <dt>Outstanding balance</dt>
            <dd className="text-lg">
              <Money amount={invoice.balanceAmount} currency={currency} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
