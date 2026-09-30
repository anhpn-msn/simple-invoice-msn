import { CUSTOMERS } from './customers';
import { buildAppendixInvoice } from './appendix-a';
import { addDays, generateInvoices } from './generate-invoices';
import { DEMO_USER_ID, GENERATED_INVOICE_COUNT } from './seed.constants';
import {
  Dec,
  deriveEffectiveStatus,
  getCurrency,
  type InvoiceStatus,
  type PersistedInvoiceStatus,
} from '../../invoices/domain';

const TODAY = '2026-09-30';
const generate = (today = TODAY) => generateInvoices(today, DEMO_USER_ID);

describe('addDays', () => {
  it('crosses month, year and leap day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('buildAppendixInvoice', () => {
  it('keeps the exact ids and values from Appendix A with Pending stored', () => {
    const { invoice, item } = buildAppendixInvoice();
    expect(invoice).toMatchObject({
      id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
      createdBy: DEMO_USER_ID,
      invoiceNumber: 'IV1780488206995',
      invoiceReference: '#5721662',
      currency: 'AUD',
      currencySymbol: 'AU$',
      status: 'Pending',
      invoiceDate: '2026-06-03',
      dueDate: '2026-07-03',
      taxRate: '10.00',
      invoiceSubTotal: '2000.00',
      totalTax: '200.00',
      totalDiscount: '20.00',
      totalAmount: '2180.00',
      totalPaid: '1451.34',
      balanceAmount: '728.66',
      customerFullname: 'Paul',
      customerEmail: 'paul@101digital.io',
      customerMobile: '947717364111',
      customerAddress: 'Singapore',
    });
    expect(item).toMatchObject({
      id: 'b1c2d3e4-0000-0000-0000-000000000001',
      invoiceId: invoice.id,
      name: 'Honda RC150',
      quantity: 2,
      rate: '1000',
    });
  });
});

describe('generateInvoices', () => {
  it('is deterministic for the same business date', () => {
    expect(generate()).toEqual(generate());
  });

  it('keeps ids, numbers and amounts when only the date changes', () => {
    const strip = (rows: ReturnType<typeof generate>) =>
      rows.map(({ invoice, item }) => ({
        id: invoice.id,
        item: item.id,
        number: invoice.invoiceNumber,
        total: invoice.totalAmount,
        paid: invoice.totalPaid,
        status: invoice.status,
      }));
    expect(strip(generate('2027-03-15'))).toEqual(strip(generate()));
  });

  it('produces 40 invoices with unique ids and case-insensitively unique numbers', () => {
    const rows = generate();
    expect(rows).toHaveLength(GENERATED_INVOICE_COUNT);
    expect(new Set(rows.map((r) => r.invoice.id)).size).toBe(40);
    expect(new Set(rows.map((r) => r.item.id)).size).toBe(40);
    expect(
      new Set(rows.map((r) => r.invoice.invoiceNumber.toLowerCase())).size,
    ).toBe(40);
  });

  it('includes a few odd number casings', () => {
    const numbers = generate().map((r) => r.invoice.invoiceNumber);
    expect(numbers.filter((n) => !n.startsWith('INV-'))).toHaveLength(3);
    expect(
      numbers.filter((n) => /^INV-2026-\d{4}$/.test(n)).length,
    ).toBeGreaterThanOrEqual(35);
  });

  it('keeps dates in the wanted window with due dates 7 to 60 days later', () => {
    for (const { invoice } of generate()) {
      const invoiceDate = invoice.invoiceDate;
      const dueDate = invoice.dueDate;
      expect(invoiceDate >= addDays(TODAY, -150)).toBe(true);
      expect(invoiceDate <= addDays(TODAY, 5)).toBe(true);
      expect(dueDate >= addDays(invoiceDate, 7)).toBe(true);
      expect(dueDate <= addDays(invoiceDate, 60)).toBe(true);
    }
  });

  it('numbers invoices in invoice date order', () => {
    const rows = generate().map((r) => r.invoice);
    const byNumber = [...rows].sort((a, b) =>
      a.invoiceNumber
        .toLowerCase()
        .localeCompare(b.invoiceNumber.toLowerCase()),
    );
    const dates = byNumber.map((r) => r.invoiceDate);
    expect(dates).toEqual([...dates].sort());
  });

  it('satisfies every money invariant of the database constraints', () => {
    for (const { invoice, item } of generate()) {
      const d = (value: unknown) => new Dec(value as string);
      const minor = getCurrency(invoice.currency).minorUnits;
      expect(
        d(invoice.totalAmount).eq(
          d(invoice.invoiceSubTotal)
            .plus(d(invoice.totalTax))
            .minus(d(invoice.totalDiscount)),
        ),
      ).toBe(true);
      expect(
        d(invoice.balanceAmount).eq(
          d(invoice.totalAmount).minus(d(invoice.totalPaid)),
        ),
      ).toBe(true);
      expect(d(invoice.totalPaid).lte(d(invoice.totalAmount))).toBe(true);
      expect(d(invoice.totalDiscount).lte(d(invoice.invoiceSubTotal))).toBe(
        true,
      );
      expect(d(invoice.totalAmount).gt(0)).toBe(true);
      expect(d(invoice.totalAmount).decimalPlaces()).toBeLessThanOrEqual(minor);
      if (invoice.status === 'Paid')
        expect(d(invoice.balanceAmount).isZero()).toBe(true);
      if (invoice.status === 'Draft')
        expect(d(invoice.totalPaid).isZero()).toBe(true);
      expect(invoice.customerMobile).toMatch(/^\+?[0-9 ()-]{6,32}$/);
      expect(item.invoiceId).toBe(invoice.id);
      expect(item.position).toBe(1);
      const decimals = item.rate.split('.')[1]?.length ?? 0;
      expect(decimals).toBeGreaterThanOrEqual(2);
      expect(decimals).toBeLessThanOrEqual(4);
    }
  });

  it('uses the planned status mix and covers every effective status', () => {
    const rows = generate().map((r) => r.invoice);
    const persisted: Record<string, number> = {};
    const effective: Record<string, number> = {};
    for (const row of rows) {
      persisted[row.status] = (persisted[row.status] ?? 0) + 1;
      const status: InvoiceStatus = deriveEffectiveStatus(
        row.status as PersistedInvoiceStatus,
        row.dueDate,
        TODAY,
      );
      effective[status] = (effective[status] ?? 0) + 1;
    }
    expect(persisted).toEqual({ Paid: 12, Pending: 18, Draft: 10 });
    for (const status of ['Draft', 'Pending', 'Paid', 'Overdue']) {
      expect(effective[status]).toBeGreaterThanOrEqual(4);
    }
    expect(
      rows.filter(
        (r) => r.status === 'Pending' && new Dec(r.totalPaid as string).gt(0),
      ),
    ).toHaveLength(7);
  });

  it('keeps the status coverage on any run date', () => {
    for (const today of ['2026-01-01', '2027-06-30', '2030-12-31']) {
      const counts: Record<string, number> = {};
      for (const { invoice } of generate(today)) {
        const status = deriveEffectiveStatus(
          invoice.status as PersistedInvoiceStatus,
          invoice.dueDate,
          today,
        );
        counts[status] = (counts[status] ?? 0) + 1;
      }
      for (const status of ['Draft', 'Pending', 'Paid', 'Overdue']) {
        expect(counts[status]).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('mixes currencies, mostly AUD, with the other four present', () => {
    const counts: Record<string, number> = {};
    for (const { invoice } of generate()) {
      counts[invoice.currency] = (counts[invoice.currency] ?? 0) + 1;
    }
    expect(counts.AUD).toBeGreaterThan(20);
    for (const code of ['USD', 'GBP', 'SGD', 'JPY'])
      expect(counts[code]).toBeGreaterThan(0);
  });

  it('uses all four tax rates and some discounts', () => {
    const rows = generate().map((r) => r.invoice);
    expect(new Set(rows.map((r) => r.taxRate))).toEqual(
      new Set(['0.00', '7.00', '10.00', '20.00']),
    );
    const discounted = rows.filter((r) => !new Dec(r.totalDiscount).isZero());
    expect(discounted.length).toBeGreaterThanOrEqual(10);
  });

  it('gives search demos shared name parts', () => {
    const names = new Set(generate().map((r) => r.invoice.customerFullname));
    expect(names.has('Acme Pty Ltd')).toBe(true);
    expect(names.has('Acme Holdings')).toBe(true);
    expect(names.size).toBe(CUSTOMERS.length);
  });

  it('creates every invoice for the given user', () => {
    expect(new Set(generate().map((r) => r.invoice.createdBy))).toEqual(
      new Set([DEMO_USER_ID]),
    );
  });
});
