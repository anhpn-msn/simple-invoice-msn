import { createHash } from 'node:crypto';

/** SHA-256 of a UTF-8 string as lowercase hex (64 characters). */
export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
