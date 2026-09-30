import { buildSeedInvoice } from './invoice-builder';
import type { SeedInvoice } from './seed.types';
import { DEMO_USER_ID } from './seed.constants';

/** Appendix A of the brief: its createdBy is the demo user's id (SPEC A-14). */

const EXPECTED = {
  subTotal: '2000.00',
  tax: '200.00',
  discount: '20.00',
  total: '2180.00',
  paid: '1451.34',
  balance: '728.66',
} as const;

/**
 * Builds the Appendix A invoice with its exact ids and values. The amounts are
 * recomputed by the domain calculator and compared with the brief's figures;
 * a difference means the calculator or the brief changed and must be looked at.
 * Persisted status is Pending: its "Overdue" is derived at read time (A-14).
 */
export function buildAppendixInvoice(): SeedInvoice {
  const seeded = buildSeedInvoice({
    id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
    itemId: 'b1c2d3e4-0000-0000-0000-000000000001',
    invoiceNumber: 'IV1780488206995',
    invoiceReference: '#5721662',
    invoiceDate: '2026-06-03',
    dueDate: '2026-07-03',
    currency: 'AUD',
    description: 'Invoice is issued to Kanglee',
    status: 'Pending',
    customer: {
      fullname: 'Paul',
      email: 'paul@101digital.io',
      mobile: '947717364111',
      address: 'Singapore',
    },
    itemName: 'Honda RC150',
    quantity: 2,
    rate: '1000',
    taxRate: '10',
    discount: { type: 'exact', amount: EXPECTED.discount },
    payment: { type: 'exact', amount: EXPECTED.paid },
    createdBy: DEMO_USER_ID,
    createdAt: new Date('2026-06-03T12:03:26.995Z'),
  });

  const { invoice } = seeded;
  const actual = {
    subTotal: invoice.invoiceSubTotal,
    tax: invoice.totalTax,
    discount: invoice.totalDiscount,
    total: invoice.totalAmount,
    paid: invoice.totalPaid,
    balance: invoice.balanceAmount,
  };
  for (const key of Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>) {
    if (actual[key] !== EXPECTED[key]) {
      throw new Error(
        `Appendix A ${key} mismatch: calculator gives ${actual[key]}, brief says ${EXPECTED[key]}`,
      );
    }
  }
  return seeded;
}
