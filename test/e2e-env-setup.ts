// Shared env defaults for e2e tests. Imported at the top of each `*.e2e-spec.ts`
// file so all four e2e suites (auth, billing, isolation, publishing) boot
// AppModule against the same in-memory configuration.
//
// Every key matches the Zod schema in src/config/config-validation.ts — if you
// add a required env var there, add a default here too (or Jest will fail at
// the ConfigModule.forRoot step before any test runs).

process.env.NODE_ENV ||= 'test';

// Database (athar-postgres on port 5442 per docker-compose.yml).
process.env.DATABASE_URL ||= 'postgresql://athar:athar@localhost:5442/athar?schema=public';

// Origin allow-list consumed by OriginGuard at app construction. Needed so the
// CSRF/Origin e2e suites have a known allowed Origin to assert against.
process.env.CORS_ORIGINS ||= 'https://app.athar.sa,http://localhost:3000';

// Redis (athar-redis on port 6389 per docker-compose.yml).
process.env.REDIS_HOST ||= 'localhost';
process.env.REDIS_PORT ||= '6389';

// JWT — must be >= 32 chars to satisfy the Zod min(32) check.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-please-change-in-production';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-please-change-in-production';
process.env.JWT_ACCESS_TTL ||= '15m';
process.env.JWT_REFRESH_TTL ||= '7d';

// Moyasar (Phase 6). Webhook secret is optional in non-production.
process.env.MOYASAR_SECRET_KEY ||= 'sk_test_dummy';
process.env.MOYASAR_PUBLISHABLE_KEY ||= 'pk_test_dummy';
process.env.MOYASAR_WEBHOOK_SECRET ||= 'whsec_test_dummy';

// AI providers (used by ContentProvider / ImageProvider / SearchProvider).
process.env.OPENAI_API_KEY ||= 'test-openai-key';
process.env.OPENAI_IMAGE_MODEL ||= 'gpt-image-1';
process.env.OPENAI_VISION_MODEL ||= 'gpt-4o-mini';
process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
process.env.ANTHROPIC_MODEL ||= 'claude-sonnet-4-5';
process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';

// MinIO / S3.
process.env.MINIO_ENDPOINT ||= 'localhost';
process.env.MINIO_PORT ||= '9000';
process.env.MINIO_ACCESS_KEY ||= 'test-minio';
process.env.MINIO_SECRET_KEY ||= 'test-minio-secret';
process.env.MINIO_BUCKET ||= 'athar-images';

// SMTP (used by Phase 5 Reminder notifier). NODE_ENV=test bypasses the
// SMTP_SECURE=true production check, so plain localhost is fine here.
process.env.SMTP_HOST ||= 'localhost';
process.env.SMTP_PORT ||= '587';
process.env.SMTP_USER ||= 'test';
process.env.SMTP_PASS ||= 'test';

// Phase 3 retention knobs.
process.env.TRIAL_DURATION_DAYS ||= '7';
process.env.PURGE_RETENTION_DAYS ||= '30';
