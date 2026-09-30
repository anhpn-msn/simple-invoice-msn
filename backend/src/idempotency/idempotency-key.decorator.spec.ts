import { BadRequestException } from '@nestjs/common';
import { parseIdempotencyKey } from './idempotency-key.decorator';

describe('parseIdempotencyKey', () => {
  it('treats an absent header as no idempotency', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
  });

  it.each([
    'a',
    '0d7c5a3e-6a54-4f19-8c53-6a0c3c8f2b11',
    'K'.repeat(255),
    '!~#$%&()*+,-./:;<=>?@[]^_`{|}',
  ])('accepts %s', (value) => {
    expect(parseIdempotencyKey(value)).toBe(value);
  });

  it.each([
    ['empty', ''],
    ['256 characters', 'K'.repeat(256)],
    ['inner space', 'two words'],
    ['leading space', ' key'],
    ['tab', 'a\tb'],
    ['newline', 'a\nb'],
    ['non-ASCII', 'clé'],
    ['emoji', 'key-😀'],
    ['repeated header joined by comma and space', 'one, two'],
  ])('rejects %s with 400', (_label, value) => {
    expect(() => parseIdempotencyKey(value)).toThrow(BadRequestException);
  });

  it('rejects an array value', () => {
    expect(() => parseIdempotencyKey(['a', 'b'])).toThrow(BadRequestException);
  });
});
