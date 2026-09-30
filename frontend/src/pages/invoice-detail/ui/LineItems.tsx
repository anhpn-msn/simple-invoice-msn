import { Money } from '@/entities/invoice'
import type { InvoiceItem } from '@/entities/invoice'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

interface LineItemsProps {
  items: InvoiceItem[]
  currency: string
}

/** Quantity and rate only. Line totals are not shown: the backend is the only calculator. */
export function LineItems({ items, currency }: Readonly<LineItemsProps>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Line items</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    <Money amount={item.rate} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="flex flex-col gap-3 md:hidden">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border p-3">
              <p className="font-medium">{item.name}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="text-right tabular-nums">{item.quantity}</dd>
                <dt className="text-muted-foreground">Rate</dt>
                <dd className="text-right">
                  <Money amount={item.rate} currency={currency} />
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
