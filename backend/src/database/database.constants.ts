/** Column sizes in `schema.ts`; request DTOs use the same numbers so input never exceeds a column. */
export const EMAIL_MAX_LENGTH = 254;
export const FULLNAME_MAX_LENGTH = 200;
export const ITEM_NAME_MAX_LENGTH = 200;
export const INVOICE_NUMBER_MAX_LENGTH = 50;
export const INVOICE_REFERENCE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const MOBILE_MAX_LENGTH = 32;
export const ADDRESS_MAX_LENGTH = 500;
export const USER_AGENT_MAX_LENGTH = 300;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export const DB_CONNECTION_TIMEOUT_MS = 5000;
export const DB_IDLE_TIMEOUT_MS = 30000;
/** Server-side cap per statement, so one slow query cannot hold a pool connection for long. */
export const DB_STATEMENT_TIMEOUT_MS = 15000;

/** PostgreSQL SQLSTATE codes the services react to. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_LOCK_NOT_AVAILABLE = '55P03';
