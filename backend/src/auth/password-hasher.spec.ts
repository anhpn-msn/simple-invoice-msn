import { getRounds } from 'bcryptjs';
import type { AppConfig } from '../config/config.types';
import { AppConfigService } from '../config/app-config.service';
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  let hasher: PasswordHasher;

  beforeAll(async () => {
    hasher = new PasswordHasher(
      new AppConfigService({ bcryptCost: 4 } as AppConfig),
    );
    await hasher.onModuleInit();
  });

  it('hashes with the configured cost and verifies the right password', async () => {
    const stored = await hasher.hash('correct horse');
    expect(getRounds(stored)).toBe(4);
    await expect(hasher.verify('correct horse', stored)).resolves.toBe(true);
    await expect(hasher.verify('wrong horse', stored)).resolves.toBe(false);
  });

  it('always rejects when there is no real hash', async () => {
    await expect(hasher.verify('anything', null)).resolves.toBe(false);
    await expect(hasher.verify('', null)).resolves.toBe(false);
  });

  it('builds the dummy hash with the same cost as real hashes', () => {
    const internal = hasher as unknown as { dummyHash: string };
    expect(getRounds(internal.dummyHash)).toBe(4);
  });
});
