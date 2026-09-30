import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { CURRENCY_CODES, DEFAULT_TAX_RATE, INVOICE_FIELD_LIMITS, type InvoiceDetail } from '@/entities/invoice'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { buildDefaultValues } from '../model/defaults'
import { invoiceFormSchema, type InvoiceFormValues } from '../model/schema'
import { classifyCreateError } from '../model/serverError'
import { useCreateInvoice } from '../model/useCreateInvoice'
import { SelectField, TextAreaField, TextField } from './fields'

interface InvoiceFormProps {
  onCreated: (invoice: InvoiceDetail) => void
  onCancel: () => void
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

export function InvoiceForm({ onCreated, onCancel }: Readonly<InvoiceFormProps>) {
  const [defaultValues] = useState(() => buildDefaultValues())
  const [bannerMessages, setBannerMessages] = useState<string[]>([])
  const createInvoice = useCreateInvoice()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
  })

  const onSubmit = (values: InvoiceFormValues) => {
    setBannerMessages([])
    createInvoice.mutate(values, {
      onSuccess: onCreated,
      onError: (error) => {
        const failure = classifyCreateError(error)
        if (failure.kind === 'invoice-number-taken') {
          setError('invoiceNumber', { type: 'server', message: failure.message }, { shouldFocus: true })
        } else if (failure.kind === 'forbidden') {
          setBannerMessages([failure.message])
        } else {
          setBannerMessages(failure.messages)
        }
      },
    })
  }

  const pending = createInvoice.isPending

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" aria-label="Create invoice">
      {bannerMessages.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>The invoice could not be created</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {bannerMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Customer">
          <TextField
            label="Customer name"
            required
            autoComplete="off"
            error={errors.customerFullname?.message}
            {...register('customerFullname')}
          />
          <TextField
            label="Customer email"
            type="email"
            required
            autoComplete="off"
            error={errors.customerEmail?.message}
            {...register('customerEmail')}
          />
          <TextField
            label="Mobile number"
            type="tel"
            autoComplete="off"
            hint="Optional. Example: +61 400 000 000"
            error={errors.customerMobileNumber?.message}
            {...register('customerMobileNumber')}
          />
          <TextAreaField
            label="Address"
            rows={3}
            autoComplete="off"
            error={errors.customerAddress?.message}
            {...register('customerAddress')}
          />
        </Section>

        <Section title="Invoice">
          <TextField
            label="Invoice number"
            required
            autoComplete="off"
            error={errors.invoiceNumber?.message}
            {...register('invoiceNumber')}
          />
          <TextField
            label="Reference"
            autoComplete="off"
            hint="Optional. For example a purchase order number."
            error={errors.invoiceReference?.message}
            {...register('invoiceReference')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Invoice date"
              type="date"
              required
              error={errors.invoiceDate?.message}
              {...register('invoiceDate', { deps: ['dueDate'] })}
            />
            <TextField
              label="Due date"
              type="date"
              required
              error={errors.dueDate?.message}
              {...register('dueDate')}
            />
          </div>
          <SelectField
            label="Currency"
            required
            error={errors.currency?.message}
            {...register('currency', { deps: ['discount'] })}
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Description"
            rows={3}
            autoComplete="off"
            error={errors.description?.message}
            {...register('description')}
          />
        </Section>

        <Section title="Item">
          <TextField
            label="Item name"
            required
            autoComplete="off"
            error={errors.itemName?.message}
            {...register('itemName')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Quantity"
              inputMode="numeric"
              required
              autoComplete="off"
              error={errors.itemQuantity?.message}
              {...register('itemQuantity')}
            />
            <TextField
              label="Rate"
              inputMode="decimal"
              required
              autoComplete="off"
              hint={`Price per unit, up to ${INVOICE_FIELD_LIMITS.itemRate.maxDecimals} decimals`}
              error={errors.itemRate?.message}
              {...register('itemRate')}
            />
          </div>
        </Section>

        <Section title="Tax and discount">
          <TextField
            label="Tax rate (%)"
            inputMode="decimal"
            autoComplete="off"
            hint={`Between 0 and ${INVOICE_FIELD_LIMITS.taxRate.max}. Leave empty to use ${DEFAULT_TAX_RATE}.`}
            error={errors.taxRate?.message}
            {...register('taxRate')}
          />
          <TextField
            label="Discount"
            inputMode="decimal"
            autoComplete="off"
            hint="A fixed amount in the invoice currency, not a percentage."
            error={errors.discount?.message}
            {...register('discount')}
          />
          <p className="text-sm text-muted-foreground">Totals are calculated by the server when you save.</p>
        </Section>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {pending ? 'Creating...' : 'Create invoice'}
        </Button>
      </div>
    </form>
  )
}
