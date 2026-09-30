import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it('returns the known digest of "abc" in lowercase hex', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
