// Jest setup file: ensure required env vars are present BEFORE any spec module loads.
// Required because @nestjs/config's `validate` runs at module-decoration time, which
// is before top-level `process.env.X ||= ...` statements in spec files execute.
process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3000';
process.env.LOG_LEVEL ??= 'info';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.REDIS_HOST ??= 'localhost';
process.env.REDIS_PORT ??= '6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-please-change-32chars';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-please-change-32chars';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.JWT_REFRESH_TTL ??= '7d';
process.env.MOYASAR_SECRET_KEY ??= 'sk_test_xxx';
process.env.MOYASAR_PUBLISHABLE_KEY ??= 'pk_test_xxx';
process.env.MOYASAR_WEBHOOK_SECRET ??= 'whsec_test_xxx';
process.env.OPENROUTER_API_KEY ??= 'sk-or-v1-test';
process.env.OPENAI_API_KEY ??= 'sk-test';
process.env.MINIO_ENDPOINT ??= 'localhost';
process.env.MINIO_PORT ??= '9000';
process.env.MINIO_USE_SSL ??= 'false';
process.env.MINIO_ACCESS_KEY ??= 'test-minio-key';
process.env.MINIO_SECRET_KEY ??= 'test-minio-secret-please-change-32chars';
process.env.MINIO_BUCKET ??= 'athar-assets';
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_PORT ??= '587';
process.env.SMTP_USER ??= 'test-smtp-user';
process.env.SMTP_PASS ??= 'test-smtp-pass';
process.env.SMTP_SECURE ??= 'false';
process.env.LLM_REGION ??= 'any';
process.env.IMAGE_GATE_PRIMARY_METHOD ??= 'overlay';
process.env.IMAGE_GATE_MAX_ATTEMPTS ??= '2';
process.env.THROTTLE_TTL_MS ??= '60000';
process.env.THROTTLE_LIMIT ??= '10';