const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const displayFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** Displays a `YYYY-MM-DD` string (e.g. `03 Jun 2026`) without any timezone shift. Returns the input when it is not a date. */
export function formatDate(value: string): string {
  const match = ISO_DATE.exec(value)
  if (!match) {
    return value
  }
  const [, year, month, day] = match
  return displayFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)))
}

/** True for a `YYYY-MM-DD` string that is a real calendar date (rejects `2026-02-30`). */
export function isRealDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) {
    return false
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Today in the browser's local timezone as `YYYY-MM-DD`. */
export function todayLocal(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
