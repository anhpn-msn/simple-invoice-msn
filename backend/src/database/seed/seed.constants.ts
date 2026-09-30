export const DEMO_EMAIL = 'demo@example.com';
export const AUDITOR_EMAIL = 'auditor@example.com';
export const DEMO_FULLNAME = 'Demo Accountant';
export const AUDITOR_FULLNAME = 'Read-only Auditor';

/** Fixed so the invoices created for the demo user keep a stable owner across reseeds. */
export const DEMO_USER_ID = 'ad1e0902-1928-4345-b513-60c86c94fc91';

/** Fixed PRNG seed: every run generates the same invoices. */
export const SEED_PRNG_SEED = 20260603;
export const GENERATED_INVOICE_COUNT = 40;

/** The seed writes in one transaction, so it needs only a tiny pool. */
export const SEED_POOL_SIZE = 2;

/** Number of distinct 32-bit values; turns a 32-bit integer into a fraction in [0, 1). */
export const UINT32_RANGE = 2 ** 32;
