import {
  Dec,
  PERCENT_DIVISOR,
  calculateInvoiceTotals,
  formatAmount,
  formatPercent,
  getCurrency,
  roundToCurrency,
} from '../../invoices/domain';
import type {
  InvoiceSpec,
  SeedInvoice,
  DiscountPlan,
  PaymentPlan,
} from './seed.types';
import type {
  NewInvoiceRow,
  NewInvoiceItemRow,
} from '../../invoices/invoices.types';

/**
 * Turns a spec into insert rows. Every amount comes from the domain
 * calculator, so seeded invoices satisfy the same rules as API-created ones
 * and the database CHECK constraints. Discount and payment are resolved in
 * steps because both depend on amounts the calculator produces.
 */
export function buildSeedInvoice(spec: InvoiceSpec): SeedInvoice {
  const { currency, quantity, rate, taxRate } = spec;

  const undiscounted = calculateInvoiceTotals({
    quantity,
    rate,
    taxRate,
    currency,
  });
  const discount = resolveDiscount(
    spec.discount,
    undiscounted.subTotal,
    currency,
  );

  const discounted = calculateInvoiceTotals({
    quantity,
    rate,
    taxRate,
    currency,
    discount,
  });
  const totalPaid = resolvePayment(
    spec.payment,
    discounted.totalAmount,
    currency,
  );

  const totals = calculateInvoiceTotals({
    quantity,
    rate,
    taxRate,
    currency,
    discount,
    totalPaid,
  });

  const invoice: NewInvoiceRow = {
    id: spec.id,
    invoiceNumber: spec.invoiceNumber,
    invoiceReference: spec.invoiceReference,
    invoiceDate: spec.invoiceDate,
    dueDate: spec.dueDate,
    currency,
    currencySymbol: getCurrency(currency).symbol,
    description: spec.description,
    status: spec.status,
    customerFullname: spec.customer.fullname,
    customerEmail: spec.customer.email,
    customerMobile: spec.customer.mobile,
    customerAddress: spec.customer.address,
    taxRate: formatPercent(new Dec(taxRate)),
    invoiceSubTotal: formatAmount(totals.subTotal, currency),
    totalTax: formatAmount(totals.taxAmount, currency),
    totalDiscount: formatAmount(totals.discount, currency),
    totalAmount: formatAmount(totals.totalAmount, currency),
    totalPaid: formatAmount(totals.totalPaid, currency),
    balanceAmount: formatAmount(totals.balanceAmount, currency),
    createdBy: spec.createdBy,
    ...(spec.createdAt ? { createdAt: spec.createdAt } : {}),
  };

  const item: NewInvoiceItemRow = {
    id: spec.itemId,
    invoiceId: spec.id,
    name: spec.itemName,
    quantity,
    rate,
    position: 1,
  };

  return { invoice, item };
}

function resolveDiscount(
  plan: DiscountPlan,
  subTotal: Dec,
  currency: string,
): Dec {
  switch (plan.type) {
    case 'none':
      return new Dec(0);
    case 'exact':
      return new Dec(plan.amount);
    case 'percent':
      return roundToCurrency(
        subTotal.times(plan.percent).dividedBy(PERCENT_DIVISOR),
        currency,
      );
  }
}

function resolvePayment(
  plan: PaymentPlan,
  totalAmount: Dec,
  currency: string,
): Dec {
  switch (plan.type) {
    case 'none':
      return new Dec(0);
    case 'full':
      return totalAmount;
    case 'exact':
      return new Dec(plan.amount);
    case 'partial': {
      const paid = roundToCurrency(
        totalAmount.times(plan.percent).dividedBy(PERCENT_DIVISOR),
        currency,
      );
      if (paid.lte(0) || paid.gte(totalAmount)) {
        throw new Error(
          `Partial payment of ${plan.percent}% is not strictly between 0 and the total`,
        );
      }
      return paid;
    }
  }
}
