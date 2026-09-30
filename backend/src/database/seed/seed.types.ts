import type { Clock } from '../../common/clock';
import type {
  InvoiceStatus,
  PersistedInvoiceStatus,
} from '../../invoices/domain';
import type {
  NewInvoiceItemRow,
  NewInvoiceRow,
} from '../../invoices/invoices.types';

/** Returns a float in [0, 1). Used only to pick indexes and sizes, never to compute money. */
export type Random = () => number;

export interface SeedCustomer {
  fullname: string;
  email: string;
  mobile: string;
  address: string;
}

export interface SeedInvoice {
  invoice: NewInvoiceRow;
  item: NewInvoiceItemRow;
}

export type DiscountPlan =
  | { type: 'none' }
  | { type: 'percent'; percent: number }
  | { type: 'exact'; amount: string };

export type PaymentPlan =
  | { type: 'none' }
  | { type: 'full' }
  | { type: 'partial'; percent: number }
  | { type: 'exact'; amount: string };

export interface InvoiceSpec {
  id: string;
  itemId: string;
  invoiceNumber: string;
  invoiceReference: string | null;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  description: string | null;
  status: PersistedInvoiceStatus;
  customer: SeedCustomer;
  itemName: string;
  quantity: number;
  rate: string;
  taxRate: string;
  discount: DiscountPlan;
  payment: PaymentPlan;
  createdBy: string;
  createdAt?: Date;
}

export interface Slot {
  status: PersistedInvoiceStatus;
  /** Whether the due date falls before (`past`) or on/after (`future`) the business date. */
  due: 'past' | 'future';
  payment: 'none' | 'partial' | 'full';
}

export interface Draft {
  index: number;
  offset: number;
  term: number;
  slot: Slot;
  currency: string;
  taxRate: string;
  discountPercent: number | null;
  customerIndex: number;
  quantity: number;
  rate: string;
  partialPercent: number;
  itemName: string;
  description: string | null;
  reference: string | null;
  id: string;
  itemId: string;
}

export interface SeedConfig {
  databaseUrl: string;
  demoPassword: string;
  bcryptCost: number;
  businessTimezone: string;
  /** Overwrite the password (and clear lockouts) of users that already exist. */
  resetPasswords: boolean;
}

export interface RunSeedOptions extends SeedConfig {
  /** Source of "now" for the business date; tests pass a FixedClock. */
  clock?: Clock;
}

export interface SeedResult {
  businessDate: string;
  usersCreated: number;
  passwordsReset: number;
  invoicesInserted: number;
  invoicesSkipped: number;
  /** All invoices in the table after the run, not only the seeded ones. */
  persisted: Record<PersistedInvoiceStatus, number>;
  effective: Record<InvoiceStatus, number>;
}
