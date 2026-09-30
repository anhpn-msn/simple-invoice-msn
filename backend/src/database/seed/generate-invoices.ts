import { Dec } from '../../invoices/domain';
import { CUSTOMERS, DESCRIPTIONS, ITEM_NAMES } from './customers';
import { buildSeedInvoice } from './invoice-builder';
import type { Draft, PaymentPlan, SeedInvoice, Slot } from './seed.types';
import {
  deck,
  deterministicUuid,
  mulberry32,
  pick,
  randomInt,
  shuffle,
} from './prng';
import { GENERATED_INVOICE_COUNT, SEED_PRNG_SEED } from './seed.constants';

/** Fixed on purpose: a new value would change every generated id and number. */

/** Earliest and latest invoice date, in days from the business date. */
const MIN_OFFSET_DAYS = -150;
const MAX_OFFSET_DAYS = 5;
const MIN_TERM_DAYS = 7;
const MAX_TERM_DAYS = 60;

const repeat = (count: number, slot: Slot): Slot[] =>
  Array.from({ length: count }, () => slot);

/**
 * The status plan is a fixed list, not a random draw, so every effective
 * status is guaranteed. Persisted: 12 Paid (30%), 18 Pending (45%), 10 Draft
 * (25%). Effective on the run date: 12 Paid, 10 Pending, 12 Overdue, 6 Draft.
 */
const SLOTS: readonly Slot[] = [
  ...repeat(6, { status: 'Paid', due: 'past', payment: 'full' }),
  ...repeat(6, { status: 'Paid', due: 'future', payment: 'full' }),
  ...repeat(6, { status: 'Pending', due: 'future', payment: 'none' }),
  ...repeat(4, { status: 'Pending', due: 'future', payment: 'partial' }),
  ...repeat(5, { status: 'Pending', due: 'past', payment: 'none' }),
  ...repeat(3, { status: 'Pending', due: 'past', payment: 'partial' }),
  ...repeat(6, { status: 'Draft', due: 'future', payment: 'none' }),
  ...repeat(4, { status: 'Draft', due: 'past', payment: 'none' }),
];

/** Sequence numbers that get an unusual casing, to exercise case-insensitive search. */
const ODD_CASING: Readonly<Record<number, string>> = {
  7: 'inv',
  19: 'Inv',
  31: 'iNv',
};

/** Calendar arithmetic on a date-only value; no clock involved. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Generates the 40 demo invoices. Everything except the dates is independent
 * of `today`: with the same seed, ids, numbers, customers and amounts are the
 * same on every run, and only the dates move with the business date. That is
 * what lets the seed run twice without creating duplicates.
 */
export function generateInvoices(
  today: string,
  createdBy: string,
  seed: number = SEED_PRNG_SEED,
): SeedInvoice[] {
  const rng = mulberry32(seed);
  const slots = shuffle(rng, SLOTS);
  const currencies = deck(rng, [
    ['AUD', 24],
    ['USD', 6],
    ['GBP', 4],
    ['SGD', 3],
    ['JPY', 3],
  ] as const);
  const taxRates = deck(rng, [
    ['0', 6],
    ['7', 6],
    ['10', 20],
    ['20', 8],
  ] as const);
  const discountFlags = deck(rng, [
    [true, 14],
    [false, 26],
  ] as const);
  const customerOrder = deck(
    rng,
    CUSTOMERS.map(
      (_, index) =>
        [index, GENERATED_INVOICE_COUNT / CUSTOMERS.length] as const,
    ),
  );

  const drafts: Draft[] = slots.map((slot, index) => {
    const term = randomInt(rng, MIN_TERM_DAYS, MAX_TERM_DAYS);
    let offset: number;
    if (slot.due === 'past') {
      offset = randomInt(rng, MIN_OFFSET_DAYS, -term - 1);
    } else {
      const upperBound = slot.status === 'Paid' ? -1 : MAX_OFFSET_DAYS;
      offset = randomInt(rng, -term, upperBound);
    }
    const currency = currencies[index];
    const quantity =
      rng() < 0.25 ? randomInt(rng, 25, 120) : randomInt(rng, 1, 24);
    const decimals = randomInt(rng, 2, 4);
    const rateUnits = randomInt(rng, 1000, 500_000);
    const discountPercent = pick(rng, [5, 10, 15, 20]);
    const partialPercent = randomInt(rng, 2, 17) * 5;
    const itemName = pick(rng, ITEM_NAMES);
    const description = rng() < 0.3 ? null : pick(rng, DESCRIPTIONS);
    const reference =
      rng() < 0.4 ? null : `PO-${randomInt(rng, 10_000, 99_999)}`;
    return {
      index,
      offset,
      term,
      slot,
      currency,
      taxRate: taxRates[index],
      discountPercent: discountFlags[index] ? discountPercent : null,
      customerIndex: customerOrder[index],
      quantity,
      rate: buildRate(rateUnits, decimals, currency),
      partialPercent,
      itemName,
      description,
      reference,
      id: deterministicUuid(rng),
      itemId: deterministicUuid(rng),
    };
  });

  // Numbers follow invoice date order, like a real sequence. Offsets do not
  // depend on today, so the order (and therefore each number) is stable.
  const ordered = [...drafts].sort(
    (a, b) => a.offset - b.offset || a.index - b.index,
  );

  return ordered.map((draft, position) => {
    const sequence = position + 1;
    const invoiceDate = addDays(today, draft.offset);
    return buildSeedInvoice({
      id: draft.id,
      itemId: draft.itemId,
      invoiceNumber: invoiceNumber(sequence),
      invoiceReference: draft.reference,
      invoiceDate,
      dueDate: addDays(invoiceDate, draft.term),
      currency: draft.currency,
      description: draft.description,
      status: draft.slot.status,
      customer: CUSTOMERS[draft.customerIndex],
      itemName: draft.itemName,
      quantity: draft.quantity,
      rate: draft.rate,
      taxRate: draft.taxRate,
      discount:
        draft.discountPercent === null
          ? { type: 'none' }
          : { type: 'percent', percent: draft.discountPercent },
      payment: paymentPlan(draft),
      createdBy,
    });
  });
}

function invoiceNumber(sequence: number): string {
  const prefix = ODD_CASING[sequence] ?? 'INV';
  return `${prefix}-2026-${String(sequence).padStart(4, '0')}`;
}

function paymentPlan(draft: Draft): PaymentPlan {
  switch (draft.slot.payment) {
    case 'none':
      return { type: 'none' };
    case 'full':
      return { type: 'full' };
    case 'partial':
      return { type: 'partial', percent: draft.partialPercent };
  }
}

/** Rate with 2 to 4 decimals, built with decimal math. JPY has no minor unit, so its rates are scaled up. */
function buildRate(units: number, decimals: number, currency: string): string {
  const base = new Dec(units).dividedBy(new Dec(10).pow(decimals));
  return (currency === 'JPY' ? base.times(50) : base).toFixed(decimals);
}
