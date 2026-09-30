import { z } from 'zod'
import { CURRENCY_CODES, INVOICE_FIELD_LIMITS as LIMITS, minorUnitsOf } from '@/entities/invoice'
import { isRealDate } from '@/shared/lib/date'
import { isDecimalString } from '@/shared/lib/money'

const INVOICE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9\-_/.#]*$/
const MOBILE_NUMBER = new RegExp(`^\\+?[0-9 ()-]{${LIMITS.customerMobileNumber.min},${LIMITS.customerMobileNumber.max}}$`)
// Capping the digit count keeps Number() exact and huge pastes out of the range check.
const QUANTITY = new RegExp(`^\\d{1,${String(LIMITS.itemQuantity.max).length}}$`)
// Every integer part of this many digits or fewer is below the rate maximum, so no number parsing is needed.
const RATE_MAX_INTEGER_DIGITS = LIMITS.itemRate.max.split('.')[0].length

const maxChars = (limit: number) => `Use at most ${limit} characters`

function isWithinRateMax(value: string): boolean {
  return value.split('.')[0].replace(/^0+/, '').length <= RATE_MAX_INTEGER_DIGITS
}

function isWithinTaxRateMax(value: string): boolean {
  const [whole, fraction = ''] = value.split('.')
  const wholeNumber = Number(whole)
  return wholeNumber < LIMITS.taxRate.max || (wholeNumber === LIMITS.taxRate.max && /^0*$/.test(fraction))
}

const isoDate = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine(isRealDate, `${label} must be a valid date`)

const rate = z
  .string()
  .trim()
  .min(1, 'Rate is required')
  .superRefine((value, ctx) => {
    if (!isDecimalString(value, LIMITS.itemRate.maxDecimals)) {
      ctx.addIssue({
        code: 'custom',
        message: `Rate must be a number with at most ${LIMITS.itemRate.maxDecimals} decimals`,
      })
    } else if (!/[1-9]/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Rate must be greater than 0' })
    } else if (!isWithinRateMax(value)) {
      ctx.addIssue({ code: 'custom', message: `Rate must not exceed ${LIMITS.itemRate.max}` })
    }
  })

const quantity = z
  .string()
  .trim()
  .min(1, 'Quantity is required')
  .superRefine((value, ctx) => {
    if (!QUANTITY.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'Quantity must be a whole number' })
    } else if (Number(value) < LIMITS.itemQuantity.min || Number(value) > LIMITS.itemQuantity.max) {
      ctx.addIssue({
        code: 'custom',
        message: `Quantity must be between ${LIMITS.itemQuantity.min} and ${LIMITS.itemQuantity.max}`,
      })
    }
  })

const taxRate = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || (isDecimalString(value, LIMITS.taxRate.maxDecimals) && isWithinTaxRateMax(value)),
    {
      message: `Tax rate must be between 0 and ${LIMITS.taxRate.max} with at most ${LIMITS.taxRate.maxDecimals} decimals`,
    },
  )

export const invoiceFormSchema = z
  .object({
    customerFullname: z.string().trim().min(1, 'Customer name is required').max(LIMITS.customerFullname, maxChars(LIMITS.customerFullname)),
    customerEmail: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(LIMITS.customerEmail, maxChars(LIMITS.customerEmail))
      .pipe(z.email('Enter a valid email address')),
    customerMobileNumber: z
      .string()
      .trim()
      .refine((value) => value === '' || MOBILE_NUMBER.test(value), {
        message: `Use ${LIMITS.customerMobileNumber.min} to ${LIMITS.customerMobileNumber.max} digits, spaces, brackets or dashes, with an optional leading +`,
      }),
    customerAddress: z.string().trim().max(LIMITS.customerAddress, maxChars(LIMITS.customerAddress)),
    invoiceNumber: z
      .string()
      .trim()
      .min(1, 'Invoice number is required')
      .max(LIMITS.invoiceNumber, maxChars(LIMITS.invoiceNumber))
      .regex(INVOICE_NUMBER, 'Start with a letter or digit. Allowed: letters, digits and - _ / . #'),
    invoiceReference: z.string().trim().max(LIMITS.invoiceReference, maxChars(LIMITS.invoiceReference)),
    invoiceDate: isoDate('Invoice date'),
    dueDate: isoDate('Due date'),
    currency: z.enum(CURRENCY_CODES, { error: 'Choose a currency' }),
    description: z.string().trim().max(LIMITS.description, maxChars(LIMITS.description)),
    itemName: z.string().trim().min(1, 'Item name is required').max(LIMITS.itemName, maxChars(LIMITS.itemName)),
    itemQuantity: quantity,
    itemRate: rate,
    taxRate,
    discount: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (isRealDate(values.invoiceDate) && isRealDate(values.dueDate) && values.dueDate < values.invoiceDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date must be on or after invoice date' })
    }

    if (values.discount !== '') {
      const decimals = minorUnitsOf(values.currency)
      if (!isDecimalString(values.discount, decimals)) {
        ctx.addIssue({
          code: 'custom',
          path: ['discount'],
          message:
            decimals === 0
              ? `Discount must be a whole number for ${values.currency}`
              : `Discount must be a number with at most ${decimals} decimals`,
        })
      }
    }
  })

export type InvoiceFormValues = z.input<typeof invoiceFormSchema>
