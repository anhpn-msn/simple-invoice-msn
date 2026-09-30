/** Canonical form used for lookup, storage and the audit hash (SPEC 7.4). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
