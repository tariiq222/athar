import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET: min length 32'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET: min length 32'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  MOYASAR_SECRET_KEY: z.string().min(1),
  MOYASAR_WEBHOOK_SECRET: z.string().optional(),
  MOYASAR_PUBLISHABLE_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default('athar-assets'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_SECURE: z.coerce.boolean().default(false),
  ENGINE_TRUSTED_DOMAINS_EXTRA: z.string().optional(),
  LLM_REGION: z.enum(['ksa', 'us', 'any']).default('any'),
  IMAGE_GATE_PRIMARY_METHOD: z.enum(['gpt-image', 'overlay']).default('overlay'),
  IMAGE_GATE_MAX_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),
  THROTTLE_TTL_MS: z.coerce.number().int().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().default(10),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const productionStrict = baseSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production') {
    if (!env.MOYASAR_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MOYASAR_WEBHOOK_SECRET'],
        message: 'MOYASAR_WEBHOOK_SECRET required in production',
      });
    }
    if (env.SMTP_SECURE === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_SECURE'],
        message: 'SMTP_SECURE must be true in production',
      });
    }
    if (env.MINIO_USE_SSL === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MINIO_USE_SSL'],
        message: 'MINIO_USE_SSL must be true in production',
      });
    }
  }
});

export function validateConfig(env: Record<string, unknown>): Record<string, unknown> {
  const result = productionStrict.safeParse(env);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`Config validation failed: ${first.path.join('.')}: ${first.message}`);
  }
  return result.data;
}
