import Decimal from 'decimal.js';
import { getCurrency } from './currency-registry';
import { DomainValidationError } from './errors';
import { Dec, parseDecimalString, roundToCurrency } from './money';
import type {
  DecimalInput,
  InvoiceCalculationInput,
  InvoiceTotals,
} from './invoice.types';
import {
  DEFAULT_TAX_RATE,
  MAX_AMOUNT_DECIMALS,
  MAX_QUANTITY,
  MAX_RATE_DECIMALS,
  MAX_TAX_RATE_DECIMALS,
  MAX_TAX_RATE_PERCENT,
  MIN_QUANTITY,
  PERCENT_DIVISOR,
  ZERO_AMOUNT,
} from './invoice.constants';

export const MAX_RATE = new Dec('999999999.9999');
export const MAX_TAX_RATE = new Dec(MAX_TAX_RATE_PERCENT);

const asString = (value: DecimalInput): string =>
  typeof value === 'string' ? value : value.toFixed();

/**
 * Computes invoice totals per SPEC 4.3: subTotal and taxAmount are rounded
 * once each (HALF_UP, currency minor units), tax is computed on the full
 * subTotal (A-2), discount is an absolute amount capped at subTotal (A-1).
 * Throws DomainValidationError listing every violated rule.
 */
export function calculateInvoiceTotals(
  input: InvoiceCalculationInput,
): InvoiceTotals {
  const { minorUnits } = getCurrency(input.currency);
  const errors: string[] = [];

  const attempt = <T>(parse: () => T): T | undefined => {
    try {
      return parse();
    } catch (error) {
      if (error instanceof DomainValidationError) {
        errors.push(...error.messages);
        return undefined;
      }
      throw error;
    }
  };

  const { quantity } = input;
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < MIN_QUANTITY ||
    quantity > MAX_QUANTITY
  ) {
    errors.push(
      `quantity must be an integer between ${MIN_QUANTITY} and ${MAX_QUANTITY}`,
    );
  }

  const rate = attempt(() => {
    const parsed = parseDecimalString(asString(input.rate), {
      maxDecimals: MAX_RATE_DECIMALS,
      allowZero: false,
      field: 'rate',
    });
    if (parsed.gt(MAX_RATE)) {
      throw new DomainValidationError(
        `rate must not exceed ${MAX_RATE.toFixed()}`,
      );
    }
    return parsed;
  });

  const taxRate = attempt(() => {
    const parsed = parseDecimalString(
      asString(input.taxRate ?? DEFAULT_TAX_RATE),
      {
        maxDecimals: MAX_TAX_RATE_DECIMALS,
        allowZero: true,
        field: 'taxRate',
      },
    );
    if (parsed.gt(MAX_TAX_RATE)) {
      throw new DomainValidationError(
        `taxRate must be between 0 and ${MAX_TAX_RATE_PERCENT}`,
      );
    }
    return parsed;
  });

  const discount = attempt(() =>
    parseCurrencyAmount(
      input.discount ?? ZERO_AMOUNT,
      'discount',
      minorUnits,
      input.currency,
    ),
  );

  const totalPaid = attempt(() =>
    parseCurrencyAmount(
      input.totalPaid ?? ZERO_AMOUNT,
      'totalPaid',
      minorUnits,
      input.currency,
    ),
  );

  if (errors.length > 0 || !rate || !taxRate || !discount || !totalPaid) {
    throw new DomainValidationError(errors);
  }

  const subTotal = roundToCurrency(
    new Dec(quantity).times(rate),
    input.currency,
  );
  const taxAmount = roundToCurrency(
    subTotal.times(taxRate).dividedBy(PERCENT_DIVISOR),
    input.currency,
  );

  if (discount.gt(subTotal)) {
    errors.push('discount must not exceed subTotal');
  }
  const totalAmount = subTotal.plus(taxAmount).minus(discount);
  if (totalPaid.gt(totalAmount)) {
    errors.push('totalPaid must not exceed totalAmount');
  }
  if (errors.length > 0) {
    throw new DomainValidationError(errors);
  }

  return {
    subTotal,
    taxAmount,
    discount,
    totalAmount,
    totalPaid,
    balanceAmount: totalAmount.minus(totalPaid),
  };
}

/**
 * Amounts that are never rounded (discount, totalPaid) are rejected when they
 * carry more precision than the currency allows, instead of silently rounding.
 */
function parseCurrencyAmount(
  value: DecimalInput,
  field: string,
  minorUnits: number,
  currency: string,
): Decimal {
  const parsed = parseDecimalString(asString(value), {
    maxDecimals: MAX_AMOUNT_DECIMALS,
    allowZero: true,
    field,
  });
  if (parsed.decimalPlaces() > minorUnits) {
    throw new DomainValidationError(
      `${field} must have at most ${minorUnits} decimal places for ${currency}`,
    );
  }
  return parsed;
}
