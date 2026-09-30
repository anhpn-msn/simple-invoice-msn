import { DEFAULT_CURRENCY, DEFAULT_TAX_RATE } from '@/entities/invoice'
import { todayLocal } from '@/shared/lib/date'
import type { InvoiceFormValues } from './schema'

const DEFAULT_DUE_DAYS = 30

/** Adds days to a `YYYY-MM-DD` string in UTC so daylight saving never shifts the result. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function buildDefaultValues(today: string = todayLocal()): InvoiceFormValues {
  return {
    customerFullname: '',
    customerEmail: '',
    customerMobileNumber: '',
    customerAddress: '',
    invoiceNumber: '',
    invoiceReference: '',
    invoiceDate: today,
    dueDate: addDays(today, DEFAULT_DUE_DAYS),
    currency: DEFAULT_CURRENCY,
    description: '',
    itemName: '',
    itemQuantity: '1',
    itemRate: '',
    taxRate: DEFAULT_TAX_RATE,
    discount: '0',
  }
}
