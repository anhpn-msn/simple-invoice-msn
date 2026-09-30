/**
 * Drops trailing zeros (and a dangling dot) from a decimal string. Uses plain string
 * operations, not a regex (no backtracking) and not number parsing (no precision loss).
 */
export function formatRate(rate: string): string {
  if (!rate.includes('.')) {
    return rate
  }
  let end = rate.length
  while (end > 0 && rate[end - 1] === '0') {
    end--
  }
  if (rate[end - 1] === '.') {
    end--
  }
  return rate.slice(0, end)
}
