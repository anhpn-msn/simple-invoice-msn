import { createHash, createHmac } from 'node:crypto';
import { scramSha256Verifier } from './runtime-role-password';

// Exchange from RFC 7677 section 3 (user "user", password "pencil").
const RFC_SALT = 'W22ZaJ0SNY7soEsUEjb6gQ==';
const RFC_NONCE = 'rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';
const RFC_AUTH_MESSAGE = [
  'n=user,r=rOprNGfwEbeRWgbNEkqO',
  `r=${RFC_NONCE},s=${RFC_SALT},i=4096`,
  `c=biws,r=${RFC_NONCE}`,
].join(',');
const RFC_CLIENT_PROOF = 'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=';
const RFC_SERVER_SIGNATURE = '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=';

const VERIFIER_FORMAT =
  /^SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/;

function parts(verifier: string): {
  iterations: number;
  salt: string;
  storedKey: Buffer;
  serverKey: Buffer;
} {
  const match = VERIFIER_FORMAT.exec(verifier);
  if (!match) throw new Error('not a SCRAM-SHA-256 verifier');
  return {
    iterations: Number(match[1]),
    salt: match[2],
    storedKey: Buffer.from(match[3], 'base64'),
    serverKey: Buffer.from(match[4], 'base64'),
  };
}

const hmac = (key: Buffer, message: string): Buffer =>
  createHmac('sha256', key).update(message).digest();

describe('scramSha256Verifier', () => {
  const verifier = scramSha256Verifier(
    'pencil',
    Buffer.from(RFC_SALT, 'base64'),
    4096,
  );

  it('uses the PostgreSQL verifier format', () => {
    expect(verifier).toMatch(VERIFIER_FORMAT);
    expect(parts(verifier)).toMatchObject({ iterations: 4096, salt: RFC_SALT });
  });

  it('derives the ServerKey of the RFC 7677 example', () => {
    const { serverKey } = parts(verifier);
    expect(hmac(serverKey, RFC_AUTH_MESSAGE).toString('base64')).toBe(
      RFC_SERVER_SIGNATURE,
    );
  });

  it('derives the StoredKey of the RFC 7677 example', () => {
    const { storedKey } = parts(verifier);
    const signature = hmac(storedKey, RFC_AUTH_MESSAGE);
    const proof = Buffer.from(RFC_CLIENT_PROOF, 'base64');
    const clientKey = Buffer.from(proof.map((byte, i) => byte ^ signature[i]));
    expect(createHash('sha256').update(clientKey).digest()).toEqual(storedKey);
  });

  it('uses a fresh random salt by default and never contains the password', () => {
    const password = 'a-runtime-password-0123456789';
    const first = scramSha256Verifier(password);
    const second = scramSha256Verifier(password);
    expect(parts(first).salt).not.toBe(parts(second).salt);
    expect(Buffer.from(parts(first).salt, 'base64')).toHaveLength(16);
    expect(first).not.toContain(password);
  });
});
