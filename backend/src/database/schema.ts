import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  char,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ADDRESS_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  FULLNAME_MAX_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  INVOICE_NUMBER_MAX_LENGTH,
  INVOICE_REFERENCE_MAX_LENGTH,
  ITEM_NAME_MAX_LENGTH,
  MOBILE_MAX_LENGTH,
  USER_AGENT_MAX_LENGTH,
} from './database.constants';

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: EMAIL_MAX_LENGTH }).notNull(),
    passwordHash: varchar('password_hash', { length: 100 }).notNull(),
    fullname: varchar('fullname', { length: FULLNAME_MAX_LENGTH }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamptz('locked_until'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} IN ('ACCOUNTANT', 'AUDITOR')`),
    check('users_failed_login_count_check', sql`${t.failedLoginCount} >= 0`),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    uniqueIndex('users_email_key').on(t.email),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey(),
    invoiceNumber: varchar('invoice_number', {
      length: INVOICE_NUMBER_MAX_LENGTH,
    }).notNull(),
    invoiceReference: varchar('invoice_reference', {
      length: INVOICE_REFERENCE_MAX_LENGTH,
    }),
    invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    currencySymbol: varchar('currency_symbol', { length: 8 }).notNull(),
    description: varchar('description', { length: DESCRIPTION_MAX_LENGTH }),
    status: varchar('status', { length: 10 }).notNull(),
    customerFullname: varchar('customer_fullname', {
      length: FULLNAME_MAX_LENGTH,
    }).notNull(),
    customerEmail: varchar('customer_email', {
      length: EMAIL_MAX_LENGTH,
    }).notNull(),
    customerMobile: varchar('customer_mobile', { length: MOBILE_MAX_LENGTH }),
    customerAddress: varchar('customer_address', {
      length: ADDRESS_MAX_LENGTH,
    }),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull(),
    invoiceSubTotal: numeric('invoice_sub_total', {
      precision: 19,
      scale: 4,
    }).notNull(),
    totalTax: numeric('total_tax', { precision: 19, scale: 4 }).notNull(),
    totalDiscount: numeric('total_discount', {
      precision: 19,
      scale: 4,
    }).notNull(),
    totalAmount: numeric('total_amount', { precision: 19, scale: 4 }).notNull(),
    totalPaid: numeric('total_paid', { precision: 19, scale: 4 })
      .notNull()
      .default('0'),
    balanceAmount: numeric('balance_amount', {
      precision: 19,
      scale: 4,
    }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check('invoices_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'invoices_status_check',
      sql`${t.status} IN ('Draft', 'Pending', 'Paid')`,
    ),
    check(
      'invoices_tax_rate_check',
      sql`${t.taxRate} >= 0 AND ${t.taxRate} <= 100`,
    ),
    check('invoices_invoice_sub_total_check', sql`${t.invoiceSubTotal} >= 0`),
    check('invoices_total_tax_check', sql`${t.totalTax} >= 0`),
    check('invoices_total_discount_check', sql`${t.totalDiscount} >= 0`),
    check('invoices_total_amount_check', sql`${t.totalAmount} >= 0`),
    check('invoices_total_paid_check', sql`${t.totalPaid} >= 0`),
    check('invoices_due_after_invoice', sql`${t.dueDate} >= ${t.invoiceDate}`),
    check(
      'invoices_discount_le_sub',
      sql`${t.totalDiscount} <= ${t.invoiceSubTotal}`,
    ),
    check(
      'invoices_total_formula',
      sql`${t.totalAmount} = ${t.invoiceSubTotal} + ${t.totalTax} - ${t.totalDiscount}`,
    ),
    check(
      'invoices_balance_formula',
      sql`${t.balanceAmount} = ${t.totalAmount} - ${t.totalPaid}`,
    ),
    check('invoices_no_overpayment', sql`${t.totalPaid} <= ${t.totalAmount}`),
    check(
      'invoices_paid_is_settled',
      sql`${t.status} <> 'Paid' OR ${t.balanceAmount} = 0`,
    ),
    check(
      'invoices_draft_is_unpaid',
      sql`${t.status} <> 'Draft' OR ${t.totalPaid} = 0`,
    ),
    uniqueIndex('invoices_invoice_number_ci_key').on(
      sql`lower(${t.invoiceNumber})`,
    ),
    index('invoices_invoice_date_idx').on(t.invoiceDate, t.id),
    index('invoices_due_date_idx').on(t.dueDate, t.id),
    index('invoices_total_amount_idx').on(t.totalAmount, t.id),
    index('invoices_status_due_idx').on(t.status, t.dueDate),
    index('invoices_created_by_idx').on(t.createdBy),
    index('invoices_number_trgm_idx').using(
      'gin',
      t.invoiceNumber.op('gin_trgm_ops'),
    ),
    index('invoices_customer_trgm_idx').using(
      'gin',
      t.customerFullname.op('gin_trgm_ops'),
    ),
  ],
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid('id').primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: ITEM_NAME_MAX_LENGTH }).notNull(),
    quantity: integer('quantity').notNull(),
    rate: numeric('rate', { precision: 19, scale: 4 }).notNull(),
    position: smallint('position').notNull().default(1),
  },
  (t) => [
    check('invoice_items_quantity_check', sql`${t.quantity} > 0`),
    check('invoice_items_rate_check', sql`${t.rate} > 0`),
    check('invoice_items_position_check', sql`${t.position} > 0`),
    unique('invoice_items_invoice_id_position_key').on(t.invoiceId, t.position),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    familyExpiresAt: timestamptz('family_expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    replacedBy: uuid('replaced_by').references(
      (): AnyPgColumn => refreshTokens.id,
      { onDelete: 'restrict' },
    ),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    userAgent: varchar('user_agent', { length: USER_AGENT_MAX_LENGTH }),
    ip: inet('ip'),
  },
  (t) => [
    unique('refresh_tokens_token_hash_key').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: varchar('idempotency_key', {
      length: IDEMPOTENCY_KEY_MAX_LENGTH,
    }).notNull(),
    requestMethod: varchar('request_method', { length: 10 }).notNull(),
    requestPath: varchar('request_path', { length: 200 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseStatus: smallint('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [
    primaryKey({
      name: 'idempotency_keys_pkey',
      columns: [t.userId, t.idempotencyKey],
    }),
    index('idempotency_keys_expires_idx').on(t.expiresAt),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    action: varchar('action', { length: 50 }).notNull(),
    outcome: varchar('outcome', { length: 10 }).notNull(),
    entityType: varchar('entity_type', { length: 30 }),
    entityId: varchar('entity_id', { length: 64 }),
    requestId: varchar('request_id', { length: 64 }),
    ip: inet('ip'),
    userAgent: varchar('user_agent', { length: USER_AGENT_MAX_LENGTH }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    check(
      'audit_events_outcome_check',
      sql`${t.outcome} IN ('SUCCESS', 'FAILURE')`,
    ),
    index('audit_events_actor_idx').on(t.actorUserId, t.occurredAt),
    index('audit_events_entity_idx').on(t.entityType, t.entityId),
  ],
);
