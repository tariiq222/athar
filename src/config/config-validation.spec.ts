import { validateConfig } from './config-validation';

describe('validateConfig', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    MOYASAR_SECRET_KEY: 'sk_test_xxx',
    MOYASAR_PUBLISHABLE_KEY: 'pk_test_xxx',
    MOYASAR_WEBHOOK_SECRET: 'whsec_xxx',
    OPENROUTER_API_KEY: 'sk-or-v1-xxx',
    OPENAI_API_KEY: 'sk-xxx',
    MINIO_ACCESS_KEY: 'minio',
    MINIO_SECRET_KEY: 'z'.repeat(32),
    SMTP_HOST: 'localhost',
    SMTP_PORT: '587',
    SMTP_USER: 'u',
    SMTP_PASS: 'p',
    NODE_ENV: 'test',
  };

  it('passes for a valid env', () => {
    expect(() => validateConfig(base)).not.toThrow();
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateConfig({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_ACCESS_SECRET is shorter than 32 chars', () => {
    expect(() => validateConfig({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET.*min length/,
    );
  });

  it('throws when NODE_ENV=production and MOYASAR_WEBHOOK_SECRET is empty', () => {
    expect(() =>
      validateConfig({
        ...base,
        NODE_ENV: 'production',
        MOYASAR_WEBHOOK_SECRET: '',
      }),
    ).toThrow(/MOYASAR_WEBHOOK_SECRET/);
  });
});
