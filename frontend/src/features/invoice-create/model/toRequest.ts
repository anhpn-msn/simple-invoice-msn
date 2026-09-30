import type { CreateInvoiceRequest } from '@/entities/invoice'
import type { InvoiceFormValues } from './schema'

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Maps validated form text to the request body. Money stays a string; only the whole-number quantity becomes a number. */
export function toCreateInvoiceRequest(values: InvoiceFormValues): CreateInvoiceRequest {
  return {
    invoiceNumber: values.invoiceNumber.trim(),
    invoiceReference: optional(values.invoiceReference),
    invoiceDate: values.invoiceDate,
    dueDate: values.dueDate,
    currency: values.currency,
    description: optional(values.description),
    customer: {
      fullname: values.customerFullname.trim(),
      email: values.customerEmail.trim(),
      mobileNumber: optional(values.customerMobileNumber),
      address: optional(values.customerAddress),
    },
    items: [{ name: values.itemName.trim(), quantity: Number(values.itemQuantity), rate: values.itemRate.trim() }],
    taxRate: optional(values.taxRate),
    discount: optional(values.discount),
  }
}
