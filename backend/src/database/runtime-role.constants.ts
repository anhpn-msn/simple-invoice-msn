/**
 * Accepted runtime role names: lowercase so PostgreSQL never case-folds them,
 * and at most 63 bytes (NAMEDATALEN - 1). The name still goes through
 * format('%I') on the server; the pattern is a second, stricter fence.
 */
export const RUNTIME_ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/** PostgreSQL reserves role names starting with `pg_`. */
export const RESERVED_ROLE_PREFIX = 'pg_';

/**
 * Printable ASCII only: for these characters SASLprep (RFC 4013) changes
 * nothing, so the SCRAM verifier built here matches what libpq and
 * node-postgres derive from the same password at login.
 */
export const RUNTIME_ROLE_PASSWORD_PATTERN = /^[\x21-\x7e]{16,128}$/;

/** PostgreSQL's default `scram_iterations`. */
export const SCRAM_ITERATIONS = 4096;
export const SCRAM_SALT_BYTES = 16;
export const SCRAM_KEY_BYTES = 32;
