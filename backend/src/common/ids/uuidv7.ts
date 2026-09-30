import { randomBytes, randomInt } from 'node:crypto';

let lastMs = 0;
let sequence = 0;

/**
 * Generates an RFC 9562 UUIDv7 (48-bit millisecond timestamp, 12-bit counter,
 * 62 random bits). Ids created in the same millisecond stay strictly
 * increasing within this process, which keeps primary key inserts index-local.
 */
export function uuidv7(now: number = Date.now()): string {
  let ms = now;
  if (ms <= lastMs) {
    ms = lastMs;
    sequence += 1;
    if (sequence > 0xfff) {
      ms += 1;
      sequence = randomInt(0, 0x800);
    }
  } else {
    sequence = randomInt(0, 0x800);
  }
  lastMs = ms;

  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = 0x70 | (sequence >> 8);
  bytes[7] = sequence & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
