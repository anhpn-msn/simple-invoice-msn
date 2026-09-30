function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        // Code-unit order, not localeCompare: the result feeds a hash and must be identical on every machine.
        .sort(compareCodeUnits)
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, sortValue(source[key])]),
    );
  }
  return value;
}

/**
 * Deterministic JSON: object keys sorted at every level and `undefined`
 * members dropped, so key order in the request never changes the fingerprint.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
