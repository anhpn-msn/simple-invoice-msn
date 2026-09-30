export const INVOICE_NUMBER_UNIQUE_INDEX = 'invoices_invoice_number_ci_key';
export const DUPLICATE_INVOICE_NUMBER = 'Invoice number already exists';
export const IDEMPOTENCY_IN_PROGRESS =
  'A request with this Idempotency-Key is being processed';
export const CONFLICTING_REQUEST_IN_PROGRESS =
  'A conflicting request is being processed, try again shortly';

/** Route that idempotency keys are scoped to; it must match `InvoicesController.create`. */
export const CREATE_INVOICE_METHOD = 'POST';
export const CREATE_INVOICE_PATH = '/invoices';

/** Longest wait on a concurrent duplicate, as a PostgreSQL interval string (bound as a parameter). */
export const INSERT_LOCK_TIMEOUT = '5s';

/** An invoice has exactly one line item today (SPEC 4), so its position is fixed. */
export const SINGLE_ITEM_POSITION = 1;

export const MIN_PAGE = 1;
export const MAX_PAGE = 100000;
export const DEFAULT_PAGE = 1;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_SORT_FIELD = 'invoiceDate';
export const DEFAULT_ORDERING = 'DESC';
export const KEYWORD_MIN_LENGTH = 1;
export const KEYWORD_MAX_LENGTH = 100;
