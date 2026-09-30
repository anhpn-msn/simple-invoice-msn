import { isUUID } from 'class-validator';
import { uuidv7 } from './uuidv7';

describe('uuidv7', () => {
  it('produces valid version 7 UUIDs with the RFC 4122 variant', () => {
    const id = uuidv7();
    expect(isUUID(id, '7')).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const ms = Date.UTC(2026, 8, 30, 12, 0, 0);
    const id = uuidv7(ms + 10_000_000);
    const encoded = parseInt(id.replace(/-/g, '').slice(0, 12), 16);
    expect(encoded).toBe(ms + 10_000_000);
  });

  it('is strictly increasing when many ids share a millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never goes backwards when the clock does', () => {
    const a = uuidv7(Date.now() + 60_000);
    const b = uuidv7(Date.now());
    expect(b > a).toBe(true);
  });
});
