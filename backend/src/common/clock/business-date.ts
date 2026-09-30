/**
 * Calendar date (`YYYY-MM-DD`) of `instant` in the IANA `timeZone`.
 * Throws RangeError for an invalid instant or unknown time zone.
 */
export function toBusinessDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) {
      throw new RangeError(`Could not resolve ${type} for ${timeZone}`);
    }
    return part.value;
  };
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
