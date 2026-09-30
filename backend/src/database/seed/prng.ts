import type { Random } from './seed.types';
import { UINT32_RANGE } from './seed.constants';
/**
 * mulberry32: a tiny 32-bit seeded generator. The same seed always gives the
 * same sequence on every machine, which is what makes the seed data stable.
 * It is not cryptographic and must never be used for secrets.
 */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** Integer in [min, max], both ends included. */
export function randomInt(rng: Random, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(
      `randomInt needs integers with min <= max, got ${min}..${max}`,
    );
  }
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Random, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick needs a non-empty list');
  return items[randomInt(rng, 0, items.length - 1)];
}

/** Fisher-Yates shuffle on a copy. */
export function shuffle<T>(rng: Random, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds a shuffled list with an exact number of each value. A "deck" gives
 * the wanted mix (for example 24 AUD, 6 USD) with certainty, where independent
 * random draws could leave a value out.
 */
export function deck<T>(
  rng: Random,
  counts: ReadonlyArray<readonly [T, number]>,
): T[] {
  const cards: T[] = [];
  for (const [value, count] of counts) {
    for (let i = 0; i < count; i += 1) cards.push(value);
  }
  return shuffle(rng, cards);
}

/** UUID-shaped id (version 4 layout) from the seeded generator, so ids repeat between runs. */
export function deterministicUuid(rng: Random): string {
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 4)
    bytes.writeUInt32BE(Math.floor(rng() * UINT32_RANGE), i);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
