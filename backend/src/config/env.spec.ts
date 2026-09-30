import { EnvValidationError, parseDatabaseUrl, parseEnv } from './env';

const SECRET = 'x'.repeat(40);

const validEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
  JWT_SECRET: SECRET,
  ...extra,
});

function issueKeys(env: NodeJS.ProcessEnv, read?: (p: string) => string) {
  try {
    parseEnv(env, read);
  } catch (error) {
    if (error instanceof EnvValidationError)
      return error.issues.map((i) => i.key);
    throw error;
  }
  return [];
}

describe('parseEnv', () => {
  it('applies the documented defaults', () => {
    const config = parseEnv(validEnv());
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      jwtAccessTtlSeconds: 3600,
      jwtIssuer: 'simple-invoice-api',
      jwtAudience: 'simple-invoice-web',
      refreshTokenTtlSeconds: 86400,
      refreshFamilyTtlSeconds: 604800,
      refreshCookiePath: '/api/auth',
      refreshCookieName: 'si_rt',
      cookieSecure: true,
      allowedOrigins: ['http://localhost:8080', 'http://localhost:5173'],
      corsOrigins: [],
      bcryptCost: 12,
      loginMaxFailedAttempts: 5,
      loginLockoutMaxSeconds: 900,
      throttleLoginLimit: 10,
      throttleRefreshLimit: 30,
      throttleGlobalLimit: 120,
      idempotencyTtlSeconds: 86400,
      businessTimezone: 'UTC',
      swaggerEnabled: true,
      logLevel: 'info',
      seedOnStart: false,
    });
  });

  it('lists every missing required key', () => {
    expect(issueKeys({})).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET']),
    );
  });

  it('never includes values in the error message', () => {
    const secret = 'short-secret-value';
    let message = '';
    try {
      parseEnv(validEnv({ JWT_SECRET: secret, PORT: 'not-a-port-value' }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('PORT');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('not-a-port-value');
  });

  describe('JWT_SECRET', () => {
    it('rejects a secret under 32 UTF-8 bytes', () => {
      expect(issueKeys(validEnv({ JWT_SECRET: 'a'.repeat(31) }))).toContain(
        'JWT_SECRET',
      );
    });

    it('counts bytes, not characters', () => {
      const multibyte = '€'.repeat(11);
      expect(multibyte.length).toBe(11);
      expect(issueKeys(validEnv({ JWT_SECRET: multibyte }))).toEqual([]);
    });

    it('reads JWT_SECRET_FILE and trims the trailing newline', () => {
      const env = validEnv({ JWT_SECRET_FILE: '/run/secrets/jwt' });
      delete env.JWT_SECRET;
      const config = parseEnv(env, () => `${SECRET}\n`);
      expect(config.jwtSecret).toBe(SECRET);
    });

    it('rejects setting both JWT_SECRET and JWT_SECRET_FILE', () => {
      expect(
        issueKeys(
          validEnv({ JWT_SECRET_FILE: '/run/secrets/jwt' }),
          () => SECRET,
        ),
      ).toContain('JWT_SECRET');
    });

    it('reports an unreadable secret file without the path contents', () => {
      const env = validEnv({ JWT_SECRET_FILE: '/nope' });
      delete env.JWT_SECRET;
      expect(
        issueKeys(env, () => {
          throw new Error('ENOENT');
        }),
      ).toContain('JWT_SECRET_FILE');
    });
  });

  describe('placeholder secrets in production', () => {
    const JWT_PLACEHOLDER = 'replace-with-a-random-secret-of-at-least-32-bytes';

    function errorMessage(env: NodeJS.ProcessEnv): string {
      try {
        parseEnv(env);
      } catch (error) {
        if (error instanceof EnvValidationError) return error.message;
        throw error;
      }
      return '';
    }

    it('rejects the .env.example JWT secret when NODE_ENV=production', () => {
      const env = validEnv({
        NODE_ENV: 'production',
        JWT_SECRET: JWT_PLACEHOLDER,
      });
      expect(issueKeys(env)).toEqual(['JWT_SECRET']);
      expect(errorMessage(env)).not.toContain(JWT_PLACEHOLDER);
    });

    it('rejects the placeholder when it comes from JWT_SECRET_FILE', () => {
      const env = validEnv({
        NODE_ENV: 'production',
        JWT_SECRET_FILE: '/run/secrets/jwt',
      });
      delete env.JWT_SECRET;
      expect(issueKeys(env, () => `${JWT_PLACEHOLDER}\n`)).toEqual([
        'JWT_SECRET',
      ]);
    });

    it('rejects the change-me database password from DB_PASSWORD', () => {
      const env = validEnv({
        NODE_ENV: 'production',
        DB_HOST: 'db',
        DB_USER: 'app',
        DB_NAME: 'app',
        DB_PASSWORD: 'change-me',
      });
      delete env.DATABASE_URL;
      expect(issueKeys(env)).toEqual(['DB_PASSWORD']);
      expect(errorMessage(env)).not.toContain('change-me');
    });

    it('rejects the change-me database password inside DATABASE_URL', () => {
      const env = validEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://app:change-me@db:5432/app',
      });
      expect(issueKeys(env)).toEqual(['DB_PASSWORD']);
    });

    it('reports both placeholders in one pass', () => {
      const env = validEnv({
        NODE_ENV: 'production',
        JWT_SECRET: JWT_PLACEHOLDER,
        DATABASE_URL: 'postgresql://app:change-me@db:5432/app',
      });
      expect(issueKeys(env)).toEqual(['JWT_SECRET', 'DB_PASSWORD']);
    });

    it.each(['development', 'test'])(
      'still accepts the placeholders when NODE_ENV=%s',
      (nodeEnv) => {
        expect(
          issueKeys(
            validEnv({
              NODE_ENV: nodeEnv,
              JWT_SECRET: JWT_PLACEHOLDER,
              DATABASE_URL: 'postgresql://app:change-me@db:5432/app',
            }),
          ),
        ).toEqual([]);
      },
    );

    it('accepts real secrets in production', () => {
      expect(issueKeys(validEnv({ NODE_ENV: 'production' }))).toEqual([]);
    });
  });

  describe('JWT_ACCESS_TTL_SECONDS', () => {
    it.each(['59', '86401', 'abc', '1.5'])('rejects %s', (value) => {
      expect(issueKeys(validEnv({ JWT_ACCESS_TTL_SECONDS: value }))).toContain(
        'JWT_ACCESS_TTL_SECONDS',
      );
    });

    it.each(['60', '900', '86400'])('accepts %s', (value) => {
      expect(
        parseEnv(validEnv({ JWT_ACCESS_TTL_SECONDS: value }))
          .jwtAccessTtlSeconds,
      ).toBe(Number(value));
    });
  });

  describe('BUSINESS_TIMEZONE', () => {
    it('accepts IANA names', () => {
      expect(
        parseEnv(validEnv({ BUSINESS_TIMEZONE: 'Australia/Sydney' }))
          .businessTimezone,
      ).toBe('Australia/Sydney');
    });

    it.each(['Mars/Olympus', '+10:00', 'not a zone'])('rejects %s', (value) => {
      expect(issueKeys(validEnv({ BUSINESS_TIMEZONE: value }))).toContain(
        'BUSINESS_TIMEZONE',
      );
    });
  });

  describe('booleans', () => {
    it.each([
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
      ['TRUE', true],
    ])('parses COOKIE_SECURE=%s', (value, expected) => {
      expect(parseEnv(validEnv({ COOKIE_SECURE: value })).cookieSecure).toBe(
        expected,
      );
    });

    it('rejects other strings', () => {
      expect(issueKeys(validEnv({ SWAGGER_ENABLED: 'maybe' }))).toContain(
        'SWAGGER_ENABLED',
      );
    });
  });

  it('treats empty strings as unset', () => {
    const config = parseEnv(
      validEnv({ PORT: '', CORS_ORIGINS: '', LOG_LEVEL: '' }),
    );
    expect(config.port).toBe(3000);
    expect(config.corsOrigins).toEqual([]);
    expect(config.logLevel).toBe('info');
  });

  it('normalizes origin lists and rejects invalid ones', () => {
    expect(
      parseEnv(
        validEnv({
          CORS_ORIGINS: 'https://a.example.com/, http://b.example.com:81',
        }),
      ).corsOrigins,
    ).toEqual(['https://a.example.com', 'http://b.example.com:81']);
    expect(issueKeys(validEnv({ ALLOWED_ORIGINS: 'ftp://x' }))).toContain(
      'ALLOWED_ORIGINS',
    );
  });

  it('requires the family TTL to cover the token TTL', () => {
    expect(
      issueKeys(
        validEnv({
          REFRESH_TOKEN_TTL_SECONDS: '1000',
          REFRESH_FAMILY_TTL_SECONDS: '500',
        }),
      ),
    ).toContain('REFRESH_FAMILY_TTL_SECONDS');
  });

  it('requires SEED_DEMO_PASSWORD to be at least 15 characters when set', () => {
    expect(issueKeys(validEnv({ SEED_DEMO_PASSWORD: 'short' }))).toContain(
      'SEED_DEMO_PASSWORD',
    );
    expect(parseEnv(validEnv()).seedDemoPassword).toBeUndefined();
  });

  describe('database configuration', () => {
    const parts = {
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USER: 'app user',
      DB_PASSWORD: 'p@ss/word',
      DB_NAME: 'invoices',
    };

    it('builds a URL from parts with escaping', () => {
      const env = validEnv(parts);
      delete env.DATABASE_URL;
      const url = new URL(parseEnv(env).databaseUrl);
      expect(url.hostname).toBe('db');
      expect(url.port).toBe('5433');
      expect(decodeURIComponent(url.username)).toBe('app user');
      expect(decodeURIComponent(url.password)).toBe('p@ss/word');
      expect(url.pathname).toBe('/invoices');
    });

    it('reads DB_PASSWORD_FILE', () => {
      const env = validEnv({ ...parts, DB_PASSWORD_FILE: '/run/secrets/db' });
      delete env.DATABASE_URL;
      delete env.DB_PASSWORD;
      const url = new URL(parseEnv(env, () => 'from-file\n').databaseUrl);
      expect(url.password).toBe('from-file');
    });

    it('prefers DATABASE_URL when both forms are present', () => {
      expect(parseEnv(validEnv(parts)).databaseUrl).toBe(
        'postgresql://user:pw@localhost:5432/db',
      );
    });

    it('names DATABASE_URL when neither form is complete', () => {
      const env = validEnv({ DB_HOST: 'db' });
      delete env.DATABASE_URL;
      expect(issueKeys(env)).toContain('DATABASE_URL');
    });

    it('rejects a non-postgres URL', () => {
      expect(issueKeys(validEnv({ DATABASE_URL: 'mysql://x/y' }))).toContain(
        'DATABASE_URL',
      );
    });
  });
});

describe('parseDatabaseUrl', () => {
  it('does not require JWT settings', () => {
    expect(
      parseDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h:5432/d' }),
    ).toBe('postgresql://u:p@h:5432/d');
  });

  it('throws EnvValidationError when nothing is configured', () => {
    expect(() => parseDatabaseUrl({})).toThrow(EnvValidationError);
  });
});
