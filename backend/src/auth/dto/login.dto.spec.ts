import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function check(
  body: Record<string, unknown>,
): Promise<{ dto: LoginDto; errors: string[] }> {
  const dto = plainToInstance(LoginDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors: errors.map((e) => e.property) };
}

describe('LoginDto', () => {
  it('trims and lowercases the email', async () => {
    const { dto, errors } = await check({
      email: '  Demo@Example.COM ',
      password: 'x',
    });
    expect(errors).toEqual([]);
    expect(dto.email).toBe('demo@example.com');
  });

  it('rejects a missing or malformed email and an empty password', async () => {
    expect(
      (await check({ email: 'nope', password: '' })).errors.sort(),
    ).toEqual(['email', 'password']);
    expect((await check({ password: 'x' })).errors).toEqual(['email']);
  });

  it('rejects non-string values without throwing', async () => {
    expect(
      (await check({ email: 42, password: { $ne: '' } })).errors.sort(),
    ).toEqual(['email', 'password']);
  });

  it('accepts 72 bytes and rejects 73, counting UTF-8 bytes not characters', async () => {
    expect(
      (await check({ email: 'a@b.co', password: 'a'.repeat(72) })).errors,
    ).toEqual([]);
    expect(
      (await check({ email: 'a@b.co', password: 'a'.repeat(73) })).errors,
    ).toEqual(['password']);
    // 25 three-byte characters are 75 bytes although only 25 characters long.
    expect(
      (await check({ email: 'a@b.co', password: '€'.repeat(25) })).errors,
    ).toEqual(['password']);
  });

  it('rejects unknown properties', async () => {
    expect(
      (await check({ email: 'a@b.co', password: 'x', role: 'ACCOUNTANT' }))
        .errors,
    ).toEqual(['role']);
  });
});
