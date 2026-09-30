import type { StatusFilterCriteria } from './invoice.types';
export const PERSISTED_STATUSES = ['Draft', 'Pending', 'Paid'] as const;
export type PersistedInvoiceStatus = (typeof PERSISTED_STATUSES)[number];

/** Persisted statuses plus the derived `Overdue`; never stored. */
export const INVOICE_STATUSES = [
  'Draft',
  'Pending',
  'Paid',
  'Overdue',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in strict `YYYY-MM-DD` form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function assertIsoDate(value: string, name: string): void {
  if (!isIsoDate(value)) {
    throw new RangeError(`${name} must be a real date in YYYY-MM-DD format`);
  }
}

/**
 * Derives the displayed status (SPEC 4.4): anything not Paid whose due date is
 * strictly before `today` is Overdue. A due date equal to today is not overdue.
 * ISO dates compare correctly as strings.
 */
export function deriveEffectiveStatus(
  persisted: PersistedInvoiceStatus,
  dueDate: string,
  today: string,
): InvoiceStatus {
  assertIsoDate(dueDate, 'dueDate');
  assertIsoDate(today, 'today');
  if (persisted !== 'Paid' && dueDate < today) {
    return 'Overdue';
  }
  return persisted;
}

/**
 * Translates an effective-status filter into a persisted-status and due-date
 * criteria (SPEC 4.4 table, A-8). `today` must come from the business calendar.
 */
export function statusFilterCriteria(
  filter: InvoiceStatus,
  today: string,
): StatusFilterCriteria {
  assertIsoDate(today, 'today');
  switch (filter) {
    case 'Overdue':
      return {
        persistedIn: ['Draft', 'Pending'],
        dueDate: { op: 'lt', value: today },
      };
    case 'Draft':
      return { persistedIn: ['Draft'], dueDate: { op: 'gte', value: today } };
    case 'Pending':
      return { persistedIn: ['Pending'], dueDate: { op: 'gte', value: today } };
    case 'Paid':
      return { persistedIn: ['Paid'] };
  }
}
