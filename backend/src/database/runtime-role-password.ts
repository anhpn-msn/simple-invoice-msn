import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import {
  SCRAM_ITERATIONS,
  SCRAM_KEY_BYTES,
  SCRAM_SALT_BYTES,
} from './runtime-role.constants';

/**
 * Builds the SCRAM-SHA-256 verifier PostgreSQL stores in `pg_authid`
 * (RFC 5802 / RFC 7677, the format `psql \password` sends). PostgreSQL keeps a
 * value in this format as is, so the plain password never reaches the server,
 * its logs or `pg_stat_statements`. The caller must pass a password for which
 * SASLprep is the identity (see RUNTIME_ROLE_PASSWORD_PATTERN).
 */
export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(SCRAM_SALT_BYTES),
  iterations: number = SCRAM_ITERATIONS,
): string {
  const saltedPassword = pbkdf2Sync(
    password,
    salt,
    iterations,
    SCRAM_KEY_BYTES,
    'sha256',
  );
  const clientKey = createHmac('sha256', saltedPassword)
    .update('Client Key')
    .digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', saltedPassword)
    .update('Server Key')
    .digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
