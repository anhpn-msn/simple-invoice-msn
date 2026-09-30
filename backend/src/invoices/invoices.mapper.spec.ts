import { toDetail, toListItem } from './invoices.mapper';
import type {
  InvoiceDetailRow,
  InvoiceItemRow,
  InvoiceListRow,
} from './invoices.types';

const TODAY = '2026-09-30';

const detailRow = (
  patch: Partial<InvoiceDetailRow> = {},
): InvoiceDetailRow => ({
  id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
  invoiceNumber: 'IV1780488206995',
  invoiceReference: '#5721662',
  invoiceDate: '2026-06-03',
  dueDate: '2026-07-03',
  currency: 'AUD',
  currencySymbol: 'AU$',
  description: 'Invoice is issued to Kanglee',
  status: 'Pending',
  customerFullname: 'Paul',
  customerEmail: 'paul@101digital.io',
  customerMobile: '947717364111',
  customerAddress: 'Singapore',
  taxRate: '10.00',
  invoiceSubTotal: '2000.0000',
  totalTax: '200.0000',
  totalDiscount: '20.0000',
  totalAmount: '2180.0000',
  totalPaid: '1451.3400',
  balanceAmount: '728.6600',
  createdAt: new Date('2026-06-03T12:03:26.995Z'),
  createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
  ...patch,
});

const itemRow = (patch: Partial<InvoiceItemRow> = {}): InvoiceItemRow => ({
  id: 'b1c2d3e4-0000-0000-0000-000000000001',
  name: 'Honda RC150',
  quantity: 2,
  rate: '1000.0000',
  ...patch,
});

describe('toDetail', () => {
  it('reproduces the SPEC 6.6 example with the derived Overdue status', () => {
    expect(toDetail(detailRow(), [itemRow()], TODAY)).toEqual({
      invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
      invoiceNumber: 'IV1780488206995',
      invoiceReference: '#5721662',
      invoiceDate: '2026-06-03',
      dueDate: '2026-07-03',
      currency: 'AUD',
      currencySymbol: 'AU$',
      description: 'Invoice is issued to Kanglee',
      status: 'Overdue',
      customer: {
        fullname: 'Paul',
        email: 'paul@101digital.io',
        mobileNumber: '947717364111',
        address: 'Singapore',
      },
      items: [
        {
          id: 'b1c2d3e4-0000-0000-0000-000000000001',
          name: 'Honda RC150',
          quantity: 2,
          rate: '1000.00',
        },
      ],
      taxRate: '10.00',
      invoiceSubTotal: '2000.00',
      totalTax: '200.00',
      totalDiscount: '20.00',
      totalAmount: '2180.00',
      totalPaid: '1451.34',
      balanceAmount: '728.66',
      createdAt: '2026-06-03T12:03:26.995Z',
      createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
    });
  });

  it('formats JPY amounts without decimals', () => {
    const result = toDetail(
      detailRow({
        currency: 'JPY',
        currencySymbol: '¥',
        invoiceSubTotal: '2000.0000',
        totalTax: '200.0000',
        totalDiscount: '20.0000',
        totalAmount: '2180.0000',
        totalPaid: '0.0000',
        balanceAmount: '2180.0000',
      }),
      [itemRow({ rate: '1000.0000' })],
      TODAY,
    );
    expect(result).toMatchObject({
      invoiceSubTotal: '2000',
      totalAmount: '2180',
      totalPaid: '0',
      balanceAmount: '2180',
    });
    expect(result.items[0].rate).toBe('1000');
  });

  it('keeps up to 4 decimals on the rate and trims extra trailing zeros', () => {
    const rate = (stored: string, currency = 'AUD') =>
      toDetail(detailRow({ currency }), [itemRow({ rate: stored })], TODAY)
        .items[0].rate;
    expect(rate('0.3333')).toBe('0.3333');
    expect(rate('12.5000')).toBe('12.50');
    expect(rate('12.3400')).toBe('12.34');
    expect(rate('999999999.9999')).toBe('999999999.9999');
    expect(rate('12.5000', 'JPY')).toBe('12.5');
  });

  it('keeps every amount a string with no float rounding', () => {
    const result = toDetail(
      detailRow({
        totalAmount: '99999999999999.9900',
        invoiceSubTotal: '99999999999999.9900',
      }),
      [itemRow()],
      TODAY,
    );
    expect(result.totalAmount).toBe('99999999999999.99');
  });

  it('returns null for missing optional fields', () => {
    const result = toDetail(
      detailRow({
        invoiceReference: null,
        description: null,
        customerMobile: null,
        customerAddress: null,
      }),
      [itemRow()],
      TODAY,
    );
    expect(result.invoiceReference).toBeNull();
    expect(result.description).toBeNull();
    expect(result.customer.mobileNumber).toBeNull();
    expect(result.customer.address).toBeNull();
  });

  it('exposes only the documented fields', () => {
    const result = toDetail(detailRow(), [itemRow()], TODAY);
    expect(Object.keys(result).sort()).toEqual(
      [
        'invoiceId',
        'invoiceNumber',
        'invoiceReference',
        'invoiceDate',
        'dueDate',
        'currency',
        'currencySymbol',
        'description',
        'status',
        'customer',
        'items',
        'taxRate',
        'invoiceSubTotal',
        'totalTax',
        'totalDiscount',
        'totalAmount',
        'totalPaid',
        'balanceAmount',
        'createdAt',
        'createdBy',
      ].sort(),
    );
    expect(Object.keys(result.items[0]).sort()).toEqual([
      'id',
      'name',
      'quantity',
      'rate',
    ]);
  });

  it('applies the derived status rules', () => {
    const status = (persisted: string, dueDate: string) =>
      toDetail(detailRow({ status: persisted, dueDate }), [itemRow()], TODAY)
        .status;
    expect(status('Pending', '2026-09-30')).toBe('Pending');
    expect(status('Pending', '2026-09-29')).toBe('Overdue');
    expect(status('Draft', '2026-09-29')).toBe('Overdue');
    expect(status('Draft', '2026-09-30')).toBe('Draft');
    expect(status('Paid', '2020-01-01')).toBe('Paid');
  });

  it('fails loudly on a status the database should never contain', () => {
    expect(() => toDetail(detailRow({ status: 'Overdue' }), [], TODAY)).toThrow(
      /Unexpected persisted invoice status/,
    );
  });
});

describe('toListItem', () => {
  const listRow = (patch: Partial<InvoiceListRow> = {}): InvoiceListRow => ({
    id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
    invoiceNumber: 'IV1780488206995',
    customerFullname: 'Paul',
    invoiceDate: '2026-06-03',
    dueDate: '2026-07-03',
    currency: 'AUD',
    currencySymbol: 'AU$',
    totalAmount: '2180.0000',
    balanceAmount: '728.6600',
    status: 'Pending',
    ...patch,
  });

  it('reproduces the SPEC 6.5 item', () => {
    expect(toListItem(listRow(), TODAY)).toEqual({
      invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
      invoiceNumber: 'IV1780488206995',
      customerName: 'Paul',
      invoiceDate: '2026-06-03',
      dueDate: '2026-07-03',
      currency: 'AUD',
      currencySymbol: 'AU$',
      totalAmount: '2180.00',
      balanceAmount: '728.66',
      status: 'Overdue',
    });
  });

  it('uses the injected business date, not the system clock', () => {
    expect(
      toListItem(listRow({ dueDate: '2026-10-05' }), '2026-10-05').status,
    ).toBe('Pending');
    expect(
      toListItem(listRow({ dueDate: '2026-10-05' }), '2026-10-06').status,
    ).toBe('Overdue');
  });

  it('formats JPY without decimals', () => {
    const item = toListItem(
      listRow({
        currency: 'JPY',
        currencySymbol: '¥',
        totalAmount: '5000.0000',
        balanceAmount: '0.0000',
      }),
      TODAY,
    );
    expect(item.totalAmount).toBe('5000');
    expect(item.balanceAmount).toBe('0');
  });
});
