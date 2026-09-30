import {
  deck,
  deterministicUuid,
  mulberry32,
  randomInt,
  shuffle,
} from './prng';

describe('mulberry32', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('gives different sequences for different seeds', () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('covers both ends of the range', () => {
    const rng = mulberry32(7);
    const seen = new Set(
      Array.from({ length: 500 }, () => randomInt(rng, 3, 6)),
    );
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('rejects an inverted range', () => {
    expect(() => randomInt(mulberry32(1), 5, 4)).toThrow(RangeError);
  });
});

describe('shuffle and deck', () => {
  it('keeps every element', () => {
    expect(shuffle(mulberry32(5), [1, 2, 3, 4, 5]).sort()).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('does not change the input', () => {
    const input = [1, 2, 3];
    shuffle(mulberry32(5), input);
    expect(input).toEqual([1, 2, 3]);
  });

  it('builds the exact counts asked for', () => {
    const cards = deck(mulberry32(5), [
      ['a', 3],
      ['b', 2],
    ] as const);
    expect(cards.filter((c) => c === 'a')).toHaveLength(3);
    expect(cards.filter((c) => c === 'b')).toHaveLength(2);
  });
});

describe('deterministicUuid', () => {
  it('has the version 4 layout and repeats for the same seed', () => {
    const id = deterministicUuid(mulberry32(42));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(deterministicUuid(mulberry32(42))).toBe(id);
  });
});
