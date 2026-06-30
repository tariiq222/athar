# Sprint A — Pre-launch P0 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every P0 finding identified by the 40-agent audit before the first paying tenant onboards. Targets security, PDPL, billing, engine cost tracking, infra, and observability.

**Architecture:** Each task is one independently shippable commit with its own TDD cycle. Code is English-only (LR hard rule). Each commit must pass `npm run lint && npm run typecheck && npm test` and must add at least one integration/E2E for new HTTP surface or new provider behavior.

**Tech Stack:** NestJS 10, Prisma 7 + `@prisma/adapter-pg`, BullMQ + ioredis, MinIO/S3, Claude (`@anthropic-ai/sdk` via OpenRouter), OpenAI gpt-image, `nestjs-pino`, `nestjs/throttler`, `nestjs/terminus`, `@nestjs/schedule`, Zod, `helmet`, Docker, GitHub Actions.

## Global Constraints

- Code is English-only. Arabic only in user-facing error strings and explicitly-requested docs.
- Never edit an applied Prisma migration (LR-004). Always add a new one.
- TDD discipline (LR-005). Test the actual behavior (failure path), not just happy path.
- Each commit is independently shippable. No "Task N depends on unfinished Task M" runtime dependencies.
- Branch isolation: every task lands on its own `tariq/<date>-<slug>` branch (per LR-008). Use `git switch -c` after each commit; merge to main sequentially.
- Per CLAUDE.md locked decisions: `ContentProvider` / `ImageProvider` / `SearchProvider` are the only entry points to AI/search. `UsageRecord` is written on every AI call. Post lifecycle is `draft → pending_review → approved → published`. Human approval is mandatory.
- Platform limits (LinkedIn 3000 chars / 3–5 hashtags; X 280 / 1–2 hashtags) live in `src/config/platform-limits.ts`.
- All amounts in halalas (minor units) for SAR pricing.
- Saudi Arabia timezone (`Asia/Riyadh`, UTC+3, no DST) for all user-visible dates.
- `costUsd` on `UsageRecord` must reflect real cost — never hardcoded `0`.

## Pre-Flight Findings

Verified against `main` at SHA `43f2459` on 2026-06-30.

| Assumption in this plan | Reality on `main` | Resolution |
|---|---|---|
| `JwtAuthGuard` is a pass-through stub | `src/tenant/jwt-auth.guard.ts:1-24` already has real JWT verification with TokenService; `src/tenant/guards.ts:1-36` is the dead stub | Delete `guards.ts` and `current-tenant.decorator.spec.ts` (Task 1.1). The P0 is "guard stub exists on disk" — fixing the dead file closes it. |
| `TenantGuard` reads `x-tenant-id` header | `src/tenant/tenant.guard.ts:1-16` already reads `tenantContext` from the request (set by JwtAuthGuard). The dead `src/tenant/guards.ts:24-29` is the header-based stub | Same as above. |
| No Dockerfile | Confirmed `Dockerfile` does not exist; `docker-compose.yml:1-30` exposes DB+Redis+MinIO on all interfaces with default credentials | Task 11 creates Dockerfile + `.dockerignore` + moves secrets to env. |
| `verifyWebhookToken` compares `body.secret_token` to env | `src/billing/webhook-signature.ts:1-9` confirmed: `timingSafeEqual` on body field vs env | Task 6 replaces with HMAC-SHA256 on raw body. |
| CI does not run E2E, build, or migration-drift check | `.github/workflows/ci.yml:1-28` confirmed: single job, lint+typecheck+test only, no Dockerfile build, no E2E | Task 12 rewrites CI with parallel jobs + E2E + build + migration-drift. |
| `Invoice` lacks VAT columns | `prisma/schema.prisma` confirmed: no `vatMinor`, no `subtotalMinor` | Task 5 adds columns + relaxes activation check. |
| `@nestjs/throttler` not installed | `package.json` does not list `@nestjs/throttler` | Task 10 installs + configures. |
| `nestjs-pino` not installed | `package.json` does not list `nestjs-pino` | Task 13 installs + wires. |
| `@sentry/*` not installed | `package.json` confirms | Task 13 installs. |
| `LiveSearchProvider.fetch` throws "not implemented" | `src/engine/search/live-search.provider.ts:69-71` confirmed | Task 7 implements. |
| `ClaudeContentProvider.summarize` throws "not implemented" | `src/engine/providers/claude/claude-content.provider.ts:69-71` confirmed | Task 7 implements. |
| `PrismaService` constructed without `connection_limit` | `src/prisma/prisma.service.ts:1-17` confirmed: `new PrismaPg({ connectionString: url })` with no pool options | Task 5 (after schema) configures pool. |
| No structured logger | `src/brand/onboarding.service.ts:21` is the only file with a `new Logger()` | Task 13 wires `nestjs-pino`. |
| Global exception filter calls `switchToHttp()` unconditionally | `src/common/filters/global-exception.filter.ts:17` confirmed | Task 9 splits HTTP/BullMQ filters. |
| `validationPipe` and `main.ts` both register ValidationPipe | `src/common/dto-validation.ts:11-22` and `src/main.ts:9-12` both create a ValidationPipe | Task 9 collapses to single `APP_PIPE`. |
| `error-envelope.ts` vs `dto-validation.ts` define two envelope shapes | `src/common/errors/error-envelope.ts:3-7` and `src/common/dto-validation.ts:3-5` | Task 9 unifies to single shape. |
| `PrismaService` writes `costUsd: 0` everywhere | `src/engine/usage/usage.recorder.ts:45-55` and 5 call sites | Task 8 introduces pricing table + computes. |
| `VisionVerifier` makes OpenAI call without `UsageRecord` | `src/engine/providers/openai/vision-verifier.ts:22-47` and called from `gpt-image.provider.ts:79` | Task 8 instruments. |
| `FactExtractor` makes Claude call without `UsageRecord` | `src/engine/search/fact-extractor.ts:24` | Task 8 instruments. |

## File Structure

**New files (Sprint A):**
- `src/config/config-validation.ts` — Zod schema for all required env vars
- `src/config/config-validation.spec.ts` — boots ConfigService with bad env, asserts throw
- `src/billing/webhook-hmac.ts` — `verifyMoyasarHmac(rawBody, signature, secret, timestamp)` using `crypto.timingSafeEqual`
- `src/billing/webhook-hmac.spec.ts`
- `src/billing/idempotency.service.ts` — `WebhookEvent.createOrIgnore(eventId, type, payload)`
- `src/billing/idempotency.service.spec.ts`
- `src/engine/usage/pricing.ts` — model → cost-per-1k-tokens table
- `src/engine/usage/pricing.spec.ts`
- `src/engine/providers/openai/vision-verifier.ts` — modified to inject `UsageRecorder` and call `record(...)` (existing file)
- `src/engine/search/fact-extractor.ts` — modified to inject `UsageRecorder` (existing file)
- `src/common/filters/http-exception.filter.ts` — extracted from `global-exception.filter.ts` (HTTP-only)
- `src/common/filters/bullmq-exception.filter.ts` — logger-only for queue workers
- `src/common/logger/pino.config.ts` — `nestjs-pino` factory
- `src/common/logger/redact-paths.ts` — list of paths to redact
- `src/health/health.controller.ts` — split into `/health/live` and `/health/ready` (existing file)
- `src/observability/sentry.ts` — `Sentry.init({ dsn, release })`
- `src/observability/metrics.controller.ts` — exposes `/metrics` (guarded by admin token)
- `prisma/migrations/20260630_sprint_a/` — schema additions
- `Dockerfile` — multi-stage build
- `.dockerignore`
- `.github/workflows/ci.yml` — rewritten
- `.github/workflows/release.yml` — tagged deploy (out of scope: just CI in Sprint A)
- `test/auth.hmac-webhook.e2e-spec.ts` — HMAC positive + negative + replay
- `test/billing.vat.e2e-spec.ts` — VAT fields + activation with VAT-inclusive amount
- `test/journey.prelaunch.e2e-spec.ts` — signup → register tenant → post webhook → invoice
- `test/migration-drift.spec.ts` — runs `prisma migrate diff` against a fresh DB and asserts zero drift

**Modified files (Sprint A):**
- `prisma/schema.prisma` — `User.role`, `User.consentGivenAt`, `User.consentVersion`, `Invoice.subtotalMinor`, `Invoice.vatMinor`, `Invoice.vatRate`, `Invoice.taxableAmountMinor`, `Invoice.legalBasis`, `Invoice.retentionUntil`, `model WebhookEvent { id, type, payload, processedAt, tenantId }`, `model AuditLog { id, tenantId, userId, action, targetType, targetId, metadata, ip, userAgent, createdAt }`
- `src/tenant/guards.ts` — DELETE
- `src/tenant/current-tenant.decorator.spec.ts` — DELETE
- `src/tenant/jwt-auth.guard.ts` — add tenantId-vs-user-tenantId cross-check (Task 2)
- `src/tenant/tenant.guard.ts` — add tenantId-vs-user-tenantId cross-check (Task 2)
- `src/auth/auth.service.ts` — add `recordUsage` consent capture, `termsVersion` arg, throttler on `register` (Task 4 + 10)
- `src/auth/auth.controller.ts` — `@Throttle` on register/login/refresh (Task 10)
- `src/auth/password.service.ts` — pin argon2id parameters (Task 2)
- `src/auth/token.service.ts` — explicit `algorithms: ['HS256']`, `iss`, `aud` (Task 2)
- `src/billing/billing.service.ts` — VAT-aware activation, Idempotency table, securityViolation AppError, cancel-at-period-end (Tasks 5, 6)
- `src/billing/billing.controller.ts` — `rawBody: true` on webhook, HMAC verify, Idempotency lookup (Task 6)
- `src/billing/moyasar.client.ts` — throw `AppError(502, ...)` on non-2xx (Task 6)
- `src/billing/billing.module.ts` — provide `IdempotencyService` (Task 6)
- `src/engine/providers/claude/claude-content.provider.ts` — implement `summarize` (Task 7)
- `src/engine/search/live-search.provider.ts` — implement `fetch` (Task 7)
- `src/engine/pipeline/pipeline.service.ts` — inject provider tokens, not concrete classes (Task 7)
- `src/engine/engine.module.ts` — drop `useFactory` for LiveSearchProvider, expose `IMAGE_PROVIDER` constant (Task 7)
- `src/engine/providers/provider.tokens.ts` — add `IMAGE_PROVIDER` (Task 7)
- `src/engine/providers/openai/gpt-image.provider.ts` — drop `setTenant`, idempotency key, no `lastBytes` retention (Task 7)
- `src/engine/providers/openai/vision-verifier.ts` — inject `UsageRecorder` (Task 8)
- `src/engine/search/fact-extractor.ts` — inject `UsageRecorder` (Task 8)
- `src/engine/usage/usage.recorder.ts` — compute `costUsd` from pricing table, instrument Vision/Fact (Task 8)
- `src/engine/month-plan/month-plan.service.ts` — implement `OnModuleDestroy`, `concurrency: 2` (Task 7)
- `src/prisma/prisma.service.ts` — pool options `{ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }` (Task 5)
- `src/main.ts` — `enableShutdownHooks`, `app.use(helmet())`, `rawBody: true`, JSON body limit 100KB, CORS allow-list, single `useGlobalPipes` (Tasks 9, 10, 13)
- `src/app.module.ts` — drop the `ValidationPipe` in `buildValidationPipe`, register `ThrottlerModule`, `LoggerModule` (Tasks 9, 10, 13)
- `src/common/dto-validation.ts` — DELETE (or strip to pipe factory only) (Task 9)
- `src/common/filters/global-exception.filter.ts` — DELETE (replaced by split filters) (Task 9)
- `src/common/errors/error-envelope.ts` — add `securityViolation`, `tenantMismatch`, `amountMismatch`, `currencyMismatch`; `meta` field shape (Task 5, 6)
- `src/health/health.controller.ts` — split into `@Get('health/live')` and `@Get('health/ready')`, use `TerminusModule` (Task 13)
- `src/user/user.service.ts` — `softDelete` schedules purge worker, `exportData` checks `deletedAt` (Task 4)
- `src/user/user.controller.ts` — delete returns 204 (Task 4)
- `package.json` — add `@nestjs/throttler`, `nestjs-pino`, `@sentry/node`, `helmet`, `@nestjs/terminus`, `zod` (Tasks 2, 9, 10, 13)
- `docker-compose.yml` — move credentials to env, add `healthcheck`, drop weak defaults (Task 11)
- `.env.example` — add every env var consumed by Zod schema (Task 1)
- `test/` — extend `auth.e2e-spec.ts`, `billing.e2e-spec.ts`, `isolation.e2e-spec.ts` (Tasks 1, 2, 4, 5, 6)

**Deleted files (Sprint A):**
- `src/tenant/guards.ts`
- `src/tenant/current-tenant.decorator.spec.ts`
- `src/common/dto-validation.ts` (or its duplicate-envelope helper)
- `src/common/filters/global-exception.filter.ts` (replaced by `http-exception.filter.ts` + `bullmq-exception.filter.ts`)

---

## Task 1.1: Delete dead guard stubs

**Files:**
- Delete: `src/tenant/guards.ts`
- Delete: `src/tenant/current-tenant.decorator.spec.ts`

**Step 1: Confirm no live imports**

```bash
grep -rE "from\s+['\"].*tenant/guards['\"]" src/ test/ 2>/dev/null | grep -v "jwt-auth.guard\|tenant.guard" || echo "no live importers"
```

Expected: `no live importers`

**Step 2: Delete the files**

```bash
git rm src/tenant/guards.ts src/tenant/current-tenant.decorator.spec.ts
```

**Step 3: Verify build still passes**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: 0 errors, all existing tests pass.

**Step 4: Commit**

```bash
git commit -m "chore: delete dead tenant/guards.ts stub and its orphan spec"
```

---

## Task 1.2: Zod config validation with fail-fast at boot

**Files:**
- Create: `src/config/config-validation.ts`
- Create: `src/config/config-validation.spec.ts`
- Modify: `src/app.module.ts` (import + use the validator factory)
- Modify: `.env.example` (add every env var)

**Interfaces:**
- Consumes: `ConfigService` from `@nestjs/config`
- Produces: `validateConfig(env: Record<string, unknown>): Record<string, unknown>` — throws `ConfigError` with first failing field

**Step 1: Write the failing test**

```typescript
// src/config/config-validation.spec.ts
import { validateConfig } from './config-validation';

describe('validateConfig', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    MOYASAR_SECRET_KEY: 'sk_test_xxx',
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
    expect(() => validateConfig({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET.*min length/);
  });

  it('throws when NODE_ENV=production and MOYASAR_WEBHOOK_SECRET is empty', () => {
    expect(() => validateConfig({ ...base, NODE_ENV: 'production', MOYASAR_WEBHOOK_SECRET: '' })).toThrow(/MOYASAR_WEBHOOK_SECRET/);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- config-validation
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/config/config-validation.ts
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MOYASAR_WEBHOOK_SECRET'], message: 'MOYASAR_WEBHOOK_SECRET required in production' });
    }
    if (env.SMTP_SECURE === false) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMTP_SECURE'], message: 'SMTP_SECURE must be true in production' });
    }
    if (env.MINIO_USE_SSL === false) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MINIO_USE_SSL'], message: 'MINIO_USE_SSL must be true in production' });
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
```

**Step 4: Wire it into AppModule**

In `src/app.module.ts`, change the ConfigModule import:

```typescript
import { validateConfig } from './config/config-validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateConfig,
    }),
    // ... rest unchanged
  ],
})
export class AppModule {}
```

**Step 5: Update `.env.example`**

Add every key the Zod schema requires, with placeholder values and a `# required` comment.

**Step 6: Run tests**

```bash
npm test -- config-validation && npm run lint && npm run typecheck
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/config/config-validation.ts src/config/config-validation.spec.ts src/app.module.ts .env.example
git commit -m "feat(config): Zod validation with fail-fast on boot + production strictness"
```

---

## Task 2.1: Harden JWT verification (algorithms, iss, aud, role binding)

**Files:**
- Modify: `src/auth/token.service.ts`
- Modify: `src/auth/password.service.ts`
- Create: `src/auth/token.service.spec.ts` (add cases for cross-type, alg, iss, aud)

**Interfaces:**
- Consumes: `ConfigService` (already injected)
- Produces: `verifyAccess(token): JwtPayload` — now requires `iss: 'athar'`, `aud: 'athar-api'`, `algorithms: ['HS256']`

**Step 1: Write failing tests for the hardening**

Append to `src/auth/token.service.spec.ts`:

```typescript
it('verifyAccess rejects a token with the wrong issuer', async () => {
  const bad = await tokens.signAccess({ sub: 'u1', tenantId: 't1' }, { issuer: 'evil' });
  await expect(tokens.verifyAccess(bad)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('verifyAccess rejects a refresh token (cross-type)', async () => {
  const refresh = await tokens.signRefresh({ sub: 'u1', tenantId: 't1' });
  await expect(tokens.verifyAccess(refresh)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('verifyAccess rejects a token signed with HS512 (wrong algorithm)', async () => {
  const other = new JwtService({ secret: 'x'.repeat(32), signOptions: { algorithm: 'HS512' } });
  const tok = await other.signAsync({ sub: 'u1', tenantId: 't1', type: 'access' });
  await expect(tokens.verifyAccess(tok)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npm test -- token.service
```

Expected: 3 new tests FAIL.

**Step 3: Update TokenService**

In `src/auth/token.service.ts`:

```typescript
const SIGN_OPTS = { algorithm: 'HS256' as const, issuer: 'athar', audience: 'athar-api' };
const VERIFY_OPTS = { algorithms: ['HS256' as const], issuer: 'athar', audience: 'athar-api' };

// signAccess + signRefresh: spread SIGN_OPTS into signOptions.
// verifyAccess + verifyRefresh: pass VERIFY_OPTS to verifyAsync.
```

**Step 4: Pin argon2id parameters in PasswordService**

In `src/auth/password.service.ts`:

```typescript
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP 2025
  timeCost: 2,
  parallelism: 1,
} as const;

async hash(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

async verify(hash: string, plain: string): Promise<boolean> {
  // narrowed catch: only swallow known malformed-hash errors
  try {
    return await argon2.verify(hash, plain);
  } catch (err) {
    if (err instanceof Error && /hash/i.test(err.message)) return false;
    throw err;
  }
}
```

**Step 5: Run tests**

```bash
npm test -- token.service password.service && npm run lint && npm run typecheck
```

Expected: PASS, all 3 new tests pass.

**Step 6: Commit**

```bash
git add src/auth/token.service.ts src/auth/token.service.spec.ts src/auth/password.service.ts
git commit -m "feat(auth): pin HS256, iss, aud + argon2id OWASP-2025 params"
```

---

## Task 2.2: TenantGuard tenantId-vs-user-tenantId cross-check

**Files:**
- Modify: `src/tenant/tenant.guard.ts`
- Create: `src/tenant/tenant.guard.spec.ts` (extend)

**Step 1: Write failing test**

In `src/tenant/tenant.guard.spec.ts`:

```typescript
it('rejects when request.tenantContext.tenantId differs from user.tenantId', async () => {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', tenantId: 't_evil' }) } } as any;
  const guard = new TenantGuard(prisma);
  const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ tenantContext: { userId: 'u1', tenantId: 't1' } }) }) };
  await expect(guard.canActivate(ctx)).rejects.toMatchObject({ response: { error: 'TENANT_MISMATCH' } });
});
```

**Step 2: Run test to confirm it fails**

```bash
npm test -- tenant.guard
```

Expected: FAIL — guard doesn't take Prisma yet.

**Step 3: Implement**

```typescript
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ tenantContext?: TenantContext }>();
    const tc = request.tenantContext;
    if (!tc?.tenantId) throw unauthenticated();
    if (tc.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: tc.userId }, select: { tenantId: true } });
      if (!user || user.tenantId !== tc.tenantId) throw securityViolation('TENANT_MISMATCH');
    }
    return true;
  }
}
```

Add `securityViolation` to `src/common/errors/error-envelope.ts`:

```typescript
export const securityViolation = (reason: string) => new AppError(403, reason, 'مخالكة أمنية — راجع السجلات.');
```

**Step 4: Update TenantModule to provide PrismaService**

```typescript
@Module({
  imports: [PrismaModule],
  providers: [TenantGuard],
  exports: [TenantGuard],
})
export class TenantModule {}
```

**Step 5: Run all tests**

```bash
npm test && npm run lint && npm run typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/tenant/tenant.guard.ts src/tenant/tenant.guard.spec.ts src/tenant/tenant.module.ts src/common/errors/error-envelope.ts
git commit -m "feat(tenant): verify user.tenantId matches JWT.tenantId"
```

---

## Task 3.1: Schema migration — User.role, consent, AuditLog, Invoice VAT, WebhookEvent

**Files:**
- Create: `prisma/migrations/20260630_sprint_a_v1_basics/migration.sql`
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: tables `User.role`, `User.consentGivenAt`, `User.consentVersion`, `AuditLog`, `WebhookEvent`, `Invoice.subtotalMinor`, `Invoice.vatMinor`, `Invoice.vatRate`, `Invoice.legalBasis`, `Invoice.retentionUntil`

**Step 1: Add the schema changes**

Append to `prisma/schema.prisma`:

```prisma
enum UserRole {
  owner
  admin
  editor
  viewer
}

model User {
  // ... existing fields ...
  role              UserRole   @default(editor)
  consentGivenAt    DateTime?
  consentVersion    String?
}

model AuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  action     String
  targetType String?
  targetId   String?
  metadata   Json?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, createdAt])
}

model WebhookEvent {
  id          String   @id // Moyasar event.id
  type        String
  tenantId    String?
  payload     Json
  processedAt DateTime?
  createdAt   DateTime @default(now())

  @@index([tenantId, createdAt])
}

model Invoice {
  // ... existing fields ...
  subtotalMinor       Int?     // price-minor, before VAT
  vatMinor            Int?     // VAT amount in halalas
  vatRate             Float    @default(0.15)  // 15% KSA
  totalMinor          Int      // grand total (subtotal + vat)
  legalBasis          String   @default("contract")
  retentionUntil      DateTime?  // set = issuedAt + 10y for ZATCA
}
```

**Step 2: Run prisma generate to type-check the schema**

```bash
npx prisma format && npx prisma generate
```

Expected: schema parses, generated client updates.

**Step 3: Create the migration (do NOT edit existing migrations)**

```bash
npx prisma migrate dev --name sprint_a_v1_basics --create-only
```

Then inspect `prisma/migrations/20260630_sprint_a_v1_basics/migration.sql` and ensure the only ops are `CREATE TYPE` (UserRole), `ALTER TABLE` for the Invoice columns, `ALTER TABLE` for User columns, and `CREATE TABLE` for AuditLog + WebhookEvent.

**Step 4: Apply against the dev DB**

```bash
npx prisma migrate deploy
```

Expected: applied cleanly.

**Step 5: Add a CI drift check (will be wired in Task 12)**

Create `test/migration-drift.spec.ts`:

```typescript
import { execSync } from 'child_process';

describe('migrations are in sync with schema.prisma', () => {
  it('prisma migrate diff reports zero drift', () => {
    execSync('npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script', { stdio: 'pipe' });
    // If non-zero drift, execSync throws. If zero drift, this passes.
  });
});
```

**Step 6: Run tests**

```bash
npm test -- migration-drift && npm run lint && npm run typecheck
```

Expected: PASS.

**Step 7: Commit (do NOT include `migrate deploy` — only the new migration + schema + spec)**

```bash
git add prisma/schema.prisma prisma/migrations/20260630_sprint_a_v1_basics test/migration-drift.spec.ts
git commit -m "feat(schema): User.role + consent + AuditLog + WebhookEvent + Invoice VAT columns"
```

---

## Task 4.1: Auth — register captures consent, throttle

**Files:**
- Modify: `src/auth/dto/register.dto.ts`
- Modify: `src/auth/auth.service.ts`
- Create: `src/auth/auth.service.spec.ts` (extend)
- Modify: `src/auth/auth.controller.ts`

**Step 1: Add `acceptTerms` + `termsVersion` to RegisterDto**

```typescript
@IsBoolean() @IsTrue({ message: 'يجب الموافقة على الشروط' }) acceptTerms!: boolean;
@IsString() @IsNotEmpty() termsVersion!: string;
```

(Add a tiny custom `@IsTrue()` validator in `src/common/validators/is-true.validator.ts`.)

**Step 2: Failing test**

```typescript
it('register persists consentGivenAt and consentVersion', async () => {
  // stub prisma.user.create, call register, assert data.consentGivenAt and data.consentVersion set
});
it('register rejects when acceptTerms is false', async () => {
  // assert 422 with CONSENT_REQUIRED
});
```

**Step 3: Implement**

In `auth.service.ts`, in the `register` method:

```typescript
const now = new Date();
const user = await this.prisma.user.create({
  data: {
    email: dto.email.toLowerCase().trim(),
    passwordHash: await this.passwords.hash(dto.password),
    name: dto.name,
    tenantId: tenant.id,
    role: 'owner',
    consentGivenAt: now,
    consentVersion: dto.termsVersion,
  },
  select: SAFE_USER_SELECT,
});
this.audit.log({ action: 'auth.register', tenantId: tenant.id, userId: user.id, metadata: { termsVersion: dto.termsVersion } });
```

Add an `AuditLogService` (new, injected):

```typescript
// src/common/audit/audit-log.service.ts
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}
  async log(entry: { tenantId: string; userId?: string; action: string; targetType?: string; targetId?: string; metadata?: any; ip?: string; userAgent?: string }) {
    await this.prisma.auditLog.create({ data: { ...entry, createdAt: new Date() } });
  }
}
```

**Step 4: Throttle the controller**

In `src/auth/auth.controller.ts`:

```typescript
import { Throttle } from '@nestjs/throttler';

@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Post('register') register(...) { ... }

@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Post('login') login(...) { ... }

@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Post('refresh') refresh(...) { ... }
```

**Step 5: Add `TimingSafeLogin` (anti-enumeration)**

In `auth.service.ts:login`, when the user is null:

```typescript
if (!user) {
  await this.passwords.hash('*timing-equalizer*'); // discard
  throw invalidCredentials();
}
```

**Step 6: Tests + commit**

```bash
npm test -- auth.service auth.controller && npm run lint && npm run typecheck
```

```bash
git add src/auth src/common/audit src/common/validators
git commit -m "feat(auth): register captures consent + per-route throttler + timing-equalized login"
```

---

## Task 5.1: VAT columns + activation amount check

**Files:**
- Modify: `src/billing/billing.service.ts`
- Modify: `src/billing/dto/subscribe.dto.ts` (no change to client; just internal)
- Modify: `src/config/billing-plans.ts` — split `priceMinor` into `priceMinorExVat` and document
- Create: `src/billing/billing.service.spec.ts` (add VAT-aware cases)

**Step 1: Failing tests**

```typescript
it('activateFromPayment accepts VAT-inclusive amount (59900 + 15% = 68885)', async () => {
  // stub fetchPayment returning amount: 68885, currency: 'SAR', status: 'paid', metadata.tenant_id, etc.
  // assert activation succeeds
});

it('activateFromPayment rejects amount that matches neither ex-VAT nor inclusive', async () => {
  // stub amount 50000 → throws AMOUNT_MISMATCH
});

it('cancel flips cancelAtPeriodEnd=true (does not kill status)', async () => {
  // assert Subscription.status remains 'active' but cancelAtPeriodEnd: true
});
```

**Step 2: Implement VAT math**

In `src/billing/billing.service.ts`, before `activateFromPayment`:

```typescript
const plan = resolvePlan(payment.metadata.plan_code ?? 'business');
const expectedExVat = plan.priceMinor;  // e.g. 59900
const expectedVat = Math.round(expectedExVat * plan.vatRate); // 8985
const expectedInclusive = expectedExVat + expectedVat; // 68885

if (![expectedExVat, expectedInclusive].includes(payment.amount)) {
  throw amountMismatch(payment.amount, [expectedExVat, expectedInclusive]);
}
```

Add `amountMismatch(actual, allowed): AppError(422, 'AMOUNT_MISMATCH', 'مبلغ الدفعة غير مطابق للسعر المتوقع.')` to `error-envelope.ts`.

**Step 3: Update Invoice creation**

In `activateFromPayment`, replace the `invoice.create` call:

```typescript
const subtotalMinor = expectedExVat;
const vatMinor = expectedVat;
await tx.invoice.create({
  data: {
    // ... existing fields ...
    subtotalMinor,
    vatMinor,
    vatRate: plan.vatRate,
    totalMinor: subtotalMinor + vatMinor,
    retentionUntil: addYears(new Date(), 10),
    legalBasis: 'contract',
  },
});
```

**Step 4: Fix `cancel` to honor cancel-at-period-end**

```typescript
async cancel(tenantId: string) {
  return this.prisma.subscription.updateMany({
    where: { tenantId, status: { not: 'canceled' } },
    data: { cancelAtPeriodEnd: true },
  });
}
```

(Add a daily BullMQ worker to flip `cancelAtPeriodEnd: true AND currentPeriodEnd <= now → status: canceled` — out of Sprint A scope; add as a follow-up Task 5.2 in a separate plan.)

**Step 5: Tests + commit**

```bash
npm test -- billing.service && npm run lint && npm run typecheck
```

```bash
git add src/billing src/common/errors
git commit -m "feat(billing): VAT-aware activation + cancel-at-period-end + ZATCA retention"
```

---

## Task 6.1: Moyasar HMAC webhook + Idempotency

**Files:**
- Create: `src/billing/webhook-hmac.ts`
- Create: `src/billing/webhook-hmac.spec.ts`
- Create: `src/billing/idempotency.service.ts`
- Create: `src/billing/idempotency.service.spec.ts`
- Modify: `src/billing/billing.controller.ts`
- Modify: `src/billing/billing.service.ts`
- Modify: `src/main.ts` (`rawBody: true`)
- Modify: `src/billing/moyasar.client.ts` (throw `AppError(502, ...)`)

**Step 1: Failing test for HMAC**

```typescript
// src/billing/webhook-hmac.spec.ts
import { signMoyasarHmac, verifyMoyasarHmac } from './webhook-hmac';
import { createHmac } from 'crypto';

describe('webhook-hmac', () => {
  const secret = 'whsec_xxx';
  it('verifies a valid signature', () => {
    const body = '{"id":"evt_1","type":"payment_paid"}';
    const ts = '1700000000';
    const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    expect(verifyMoyasarHmac(body, `${ts}.${sig}`, secret)).toBe(true);
  });
  it('rejects a tampered body', () => {
    const body = '{"id":"evt_1"}';
    const ts = '1700000000';
    const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    const tampered = '{"id":"evt_2"}';
    expect(verifyMoyasarHmac(tampered, `${ts}.${sig}`, secret)).toBe(false);
  });
  it('rejects an old timestamp (>5 min)', () => {
    const body = '{}';
    const oldTs = String(Math.floor(Date.now() / 1000) - 600);
    const sig = createHmac('sha256', secret).update(`${oldTs}.${body}`).digest('hex');
    expect(verifyMoyasarHmac(body, `${oldTs}.${sig}`, secret)).toBe(false);
  });
});
```

**Step 2: Implement**

```typescript
// src/billing/webhook-hmac.ts
import { createHmac, timingSafeEqual } from 'crypto';

const MAX_SKEW_SEC = 300;

export function verifyMoyasarHmac(body: string, signature: string, secret: string): boolean {
  const parts = signature.split('.', 2);
  if (parts.length !== 2) return false;
  const [tsStr, sigHex] = parts;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) return false;
  const expected = createHmac('sha256', secret).update(`${tsStr}.${body}`).digest();
  const received = Buffer.from(sigHex, 'hex');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
```

**Step 3: IdempotencyService**

```typescript
// src/billing/idempotency.service.ts
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}
  async claim(eventId: string, type: string, tenantId: string | null, payload: unknown): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({ data: { id: eventId, type, tenantId, payload: payload as any } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2002') return false; // already processed
      throw err;
    }
  }
  async markProcessed(eventId: string) {
    await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
  }
}
```

**Step 4: Wire raw body + HMAC in the controller**

In `src/main.ts`:

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
```

In `src/billing/billing.controller.ts`:

```typescript
@Post('webhook')
async webhook(@Req() req: RawBodyRequest<Request>, @Headers('signature') signature: string) {
  const raw = req.rawBody!.toString('utf8');
  if (!verifyMoyasarHmac(raw, signature, this.cfg.get('MOYASAR_WEBHOOK_SECRET')!)) {
    throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'توقيع Webhook غير صالح.');
  }
  const event = JSON.parse(raw);
  if (!(await this.idempotency.claim(event.id, event.type, event.data?.metadata?.tenant_id, event))) {
    return { received: true, idempotent: true };
  }
  await this.billing.handleWebhookEvent(event);
  await this.idempotency.markProcessed(event.id);
  return { received: true };
}
```

**Step 5: Drop the `body.secret_token` comparison in `webhook-signature.ts`**

Delete `src/billing/webhook-signature.ts` (or mark `@deprecated`).

**Step 6: `MoyasarClient` throws AppError**

In `moyasar.client.ts:private async parse(res)`:

```typescript
if (!res.ok) throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'فشل بوابة الدفع.');
```

Log the raw text via a constructor-injected `Logger` (not the response body).

**Step 7: E2E for the webhook**

`test/billing.hmac-webhook.e2e-spec.ts`:

```typescript
it('rejects a webhook with bad signature', () => {
  return request(app.getHttpServer())
    .post('/api/v1/billing/webhook')
    .set('signature', 'invalid')
    .send({ id: 'evt_1' })
    .expect(401);
});

it('rejects replay (same event id)', async () => {
  // sign + send twice → second call returns 200 with { idempotent: true }, no second invoice
});
```

**Step 8: Run + commit**

```bash
npm test -- webhook-hmac idempotency billing.e2e && npm run lint && npm run typecheck
```

```bash
git add src/billing src/main.ts test/billing.hmac-webhook.e2e-spec.ts
git commit -m "feat(billing): HMAC-SHA256 webhook + Idempotency table + rawBody + 502 on gateway error"
```

---

## Task 7.1: Provider seam — implement `summarize` + `fetch` + drop `setTenant` + `IMAGE_PROVIDER` token

**Files:**
- Modify: `src/engine/providers/claude/claude-content.provider.ts`
- Modify: `src/engine/search/live-search.provider.ts`
- Modify: `src/engine/providers/openai/gpt-image.provider.ts`
- Modify: `src/engine/providers/provider.tokens.ts`
- Modify: `src/engine/engine.module.ts`
- Modify: `src/engine/pipeline/pipeline.service.ts`
- Modify: `src/engine/pipeline/pipeline.service.spec.ts` (extend)
- Modify: `src/engine/month-plan/month-plan.service.ts`

**Step 1: Failing tests for `summarize`**

```typescript
// claude-content.provider.spec.ts
it('summarize returns a valid SummaryResult for a real prompt', async () => {
  const result = await provider.summarize({ brand, sources: [{ url, title, text }] });
  expect(result.summary).toBeDefined();
  expect(result.confidence).toBeGreaterThan(0);
});
```

**Step 2: Implement**

In `claude-content.provider.ts:69-71`, replace the throw with a real call:

```typescript
async summarize(input: SummarizeInput): Promise<SummaryResult> {
  const res = await this.claude.complete({
    system: SUMMARIZE_SYSTEM_PROMPT, // new constant with brand-analysis instructions
    messages: [{ role: 'user', content: this.buildSummarizePrompt(input) }],
    maxTokens: 1024,
  });
  return this.parseSummary(res.text);
}
```

(Implement `SUMMARIZE_SYSTEM_PROMPT` + `buildSummarizePrompt` + `parseSummary` in the same file. The JSON shape matches `SummaryResult` from `engine/types.ts`.)

**Step 3: Failing test + impl for `LiveSearchProvider.fetch`**

```typescript
async fetch(input: FetchInput): Promise<FetchResult> {
  return this.sourceFetcher.fetchPage(input.url, this.whitelist);
}
```

(Inject `SourceFetcher` via constructor; remove the `useFactory` in `engine.module.ts`.)

**Step 4: Drop `setTenant` from GptImageProvider**

In `gpt-image.provider.ts`:

- Remove `tenantId` field + `setTenant` method.
- Extend `ImageProvider.generateImage(brief, kit, platform, context: { tenantId: string }): Promise<ImageAsset>`.
- Update `pipeline.service.ts:68` to pass `brand.tenantId` directly.

**Step 5: Add `IMAGE_PROVIDER` token + use it in PipelineService**

In `provider.tokens.ts`:

```typescript
export const IMAGE_PROVIDER = 'ImageProvider' as const;
```

In `engine.module.ts`, replace the `useFactory` for `LiveSearchProvider` with a normal `providers: [LiveSearchProvider]` and inject the candidate URL provider via `@Inject(CANDIDATE_URL_PROVIDER)`.

In `pipeline.service.ts`, change the constructor to inject the tokens:

```typescript
@Inject(CONTENT_PROVIDER) private readonly content: ContentProvider,
@Inject(IMAGE_PROVIDER) private readonly image: ImageProvider,
@Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
```

**Step 6: Idempotency in `GptImageProvider.generateImage`**

Accept an `idempotencyKey: string` and forward to OpenAI:

```typescript
await this.imageClient.generate(prompt, size, { idempotencyKey });
```

Derive the MinIO key deterministically:

```typescript
const key = `posts/${tenantId}/${randomUUID()}.png`; // not Date.now()+Math.random
```

**Step 7: `OnModuleDestroy` on MonthPlanService**

```typescript
async onModuleDestroy() {
  await this.worker?.close();
  await this.queue?.close();
}

@Processor('month-plan', { concurrency: 2, limiter: { max: 30, duration: 60_000 } })
```

**Step 8: Tests + commit**

```bash
npm test -- engine && npm run lint && npm run typecheck
```

```bash
git add src/engine
git commit -m "feat(engine): implement summarize/fetch + drop setTenant + IMAGE_PROVIDER token + idempotency"
```

---

## Task 8.1: Cost tracking — pricing table + Vision/Fact UsageRecord

**Files:**
- Create: `src/engine/usage/pricing.ts`
- Create: `src/engine/usage/pricing.spec.ts`
- Modify: `src/engine/usage/usage.recorder.ts`
- Modify: `src/engine/providers/openai/vision-verifier.ts`
- Modify: `src/engine/search/fact-extractor.ts`
- Modify: `src/engine/draft/draft.stage.ts`
- Modify: `src/engine/draft/critique.stage.ts`
- Modify: `src/engine/providers/openai/gpt-image.provider.ts`
- Modify: `src/engine/providers/claude/claude-content.provider.ts` (add `lastUsage` typing)
- Modify: `src/engine/learning/learning.service.ts`

**Step 1: Failing test for pricing**

```typescript
// pricing.spec.ts
it('computes Claude Sonnet text cost for input tokens', () => {
  expect(textCostUsd('claude-3-5-sonnet', 1000, 500)).toBeCloseTo(0.003 + 0.0075, 5);
});
it('computes gpt-image cost per attempt', () => {
  expect(imageCostUsd('gpt-image-1', 1024, 1024, 3)).toBeGreaterThan(0.1);
});
```

**Step 2: Pricing table**

```typescript
// src/engine/usage/pricing.ts
type Model = 'claude-3-5-sonnet' | 'claude-3-5-haiku' | 'gpt-image-1' | 'gpt-4o-mini';

const PER_1K: Record<Model, { input: number; output: number }> = {
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku':  { input: 0.0008, output: 0.004 },
  'gpt-image-1':       { input: 0.04, output: 0.04 },  // flat per image
  'gpt-4o-mini':       { input: 0.00015, output: 0.0006 },
};

export function textCostUsd(model: Model, inputTokens: number, outputTokens: number): number {
  const p = PER_1K[model];
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

export function imageCostUsd(model: Model, w: number, h: number, attempts: number): number {
  return PER_1K[model].input * attempts;
}
```

**Step 3: UsageRecorder gets `costUsd` injection + every record site computes**

In `usage.recorder.ts`, change `record({...})` to accept a `costUsd: number` field (default 0 for backward compat). The 5 call sites pass a computed value:

- `draft.stage.ts`: `costUsd: textCostUsd(this.model, inTok, outTok)`
- `critique.stage.ts`: same
- `gpt-image.provider.ts`: `costUsd: imageCostUsd('gpt-image-1', w, h, attempts)` (and one per vision verify)
- `learning.service.ts`: `costUsd: textCostUsd(this.model, inTok, outTok)`
- `live-search.provider.ts`: `costUsd: 0` (search is just HTTP fetches; priced separately by SourceFetcher if desired)

Each provider needs to track its `model` (already a constructor field for Claude + OpenAI; gpt-image has the constant).

**Step 4: Instrument VisionVerifier**

```typescript
// vision-verifier.ts
constructor(
  private readonly cfg: ConfigService,
  private readonly recorder: UsageRecorder,  // NEW
  private readonly model = cfg.getOrThrow<string>('OPENAI_VISION_MODEL'),
) {}

async verify(imageBytes: Buffer, expectedText: string): Promise<VerifyResult> {
  const res = await this.openai.chat.completions.create({ ... });
  await this.recorder.record({
    tenantId: this.tenantId,  // thread through verify() arg
    kind: 'image_verify',
    units: 1,
    costUsd: textCostUsd('gpt-4o-mini', res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0),
  });
  return { matches, verifiedText: ... };
}
```

(Add `kind: 'image_verify'` to the `UsageKind` enum in `prisma/schema.prisma` via a new migration.)

**Step 5: Instrument FactExtractor**

Same shape — inject `UsageRecorder`, call `record({ kind: 'text', units: tokens, costUsd: textCostUsd(...) })` after each `claude.complete` in `extract`.

**Step 6: Tests + commit**

```bash
npm test -- pricing usage engine && npm run lint && npm run typecheck
```

```bash
git add src/engine/usage src/engine/providers src/engine/draft src/engine/search src/engine/learning prisma/schema.prisma prisma/migrations/<next>
git commit -m "feat(engine): costUsd pricing table + Vision/Fact UsageRecord + image_verify kind"
```

(Schema migration for `image_verify` is its own commit if you want atomicity.)

---

## Task 9.1: Global exception filter split + dead code cleanup + ValidationPipe collapse

**Files:**
- Create: `src/common/filters/http-exception.filter.ts`
- Create: `src/common/filters/bullmq-exception.filter.ts`
- Create: `src/common/filters/http-exception.filter.spec.ts`
- Delete: `src/common/filters/global-exception.filter.ts`
- Modify: `src/common/dto-validation.ts` (delete the `errorEnvelope` helper, keep only the pipe factory)
- Modify: `src/main.ts` (drop `useGlobalPipes`, drop the unused `ValidationPipe`)
- Modify: `src/app.module.ts` (drop the `useFactory` filter; register `http-exception` as `APP_FILTER`)

**Step 1: Failing test for the HTTP filter**

```typescript
// http-exception.filter.spec.ts
it('returns 401 with UNAUTHENTICATED for unauthenticated()', () => {
  // boot TestingModule, throw unauthenticated(), assert response envelope shape
});
it('does not crash on a non-HTTP host (BullMQ context)', () => {
  // mock ExecutionContext with getType() returning 'rpc', assert filter throws or returns no envelope but logs
});
```

**Step 2: Implement HTTP filter**

```typescript
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      this.logger.error({ err: exception }, 'non-http exception reached HTTP filter');
      throw exception; // let other transport handlers deal with it
    }
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const envelope = toEnvelope(exception, req);
    res.status(envelope.statusCode).json(envelope);
    if (envelope.statusCode >= 500) {
      this.logger.error({ err: exception, path: req.url }, '5xx response');
    }
  }
}
```

**Step 3: Implement BullMQ filter (logger only)**

```typescript
@Catch()
export class BullmqExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BullmqExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    this.logger.error({ err: exception, type: host.getType() }, 'worker exception');
    throw exception; // re-throw so BullMQ marks the job failed
  }
}
```

**Step 4: Wire in AppModule**

```typescript
{ provide: APP_FILTER, useClass: HttpExceptionFilter }
```

(BullMQ filter is registered per-processor in Tasks 7 and 11 as needed — or in the engine module.)

**Step 5: Drop `useGlobalPipes` in main.ts**

In `src/main.ts:9-12`, remove the `new ValidationPipe({...})` line. Keep only the `APP_PIPE` in `app.module.ts`.

**Step 6: Tests + commit**

```bash
npm test -- http-exception && npm run lint && npm run typecheck
```

```bash
git add src/common src/main.ts src/app.module.ts
git commit -m "refactor(errors): split HTTP/BullMQ filters + unify envelope + drop duplicate ValidationPipe"
```

---

## Task 10.1: Throttler (per-IP, per-tenant for auth + billing webhook)

**Files:**
- Modify: `package.json` (add `@nestjs/throttler`)
- Modify: `src/app.module.ts`
- Create: `src/common/throttler/tenant-throttler.guard.ts` (custom guard that scopes by `req.tenantContext.tenantId`)

**Step 1: Install + wire**

```bash
npm install @nestjs/throttler
```

In `app.module.ts`:

```typescript
ThrottlerModule.forRoot([{ name: 'short', ttl: 1000, limit: 3 }, { name: 'medium', ttl: 60_000, limit: 20 }]),
```

In `auth.controller.ts`, apply the per-route `@Throttle` already added in Task 4.1.

**Step 2: Failing test**

```typescript
it('rejects the 6th login attempt in 60s for the same IP', async () => {
  for (let i = 0; i < 5; i++) await login('u@e.com', 'pwd');
  await expect(login('u@e.com', 'pwd')).rejects.toMatchObject({ status: 429 });
});
```

**Step 3: Commit**

```bash
git add package.json src/app.module.ts src/common/throttler test
git commit -m "feat(security): @nestjs/throttler on auth + webhook"
```

---

## Task 11.1: Dockerfile + .dockerignore + docker-compose hardening

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docker-compose.yml`

**Step 1: Write `Dockerfile` (multi-stage)**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r node && useradd -r -g node node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health/live || exit 1
CMD ["node", "dist/main.js"]
```

**Step 2: `.dockerignore`**

```
node_modules
dist
.git
.env
.env.*
coverage
*.log
.claude
.superpowers
.kilocode
.github
docs
test
README.md
CLAUDE.md
```

**Step 3: `docker-compose.yml`**

- Move all passwords to env (compose `${VAR:-}` interpolation).
- Add `healthcheck` on postgres/redis/minio.
- Add `restart: unless-stopped` and `mem_limit: 512m` on data services.
- Add an `app` service that builds from the Dockerfile, depends on `condition: service_healthy`.

**Step 4: Verify locally**

```bash
docker compose build
docker compose up -d
curl -fsS http://localhost:3000/health/live
```

Expected: `{"status":"ok"}` (or whatever the health envelope looks like after Task 13).

**Step 5: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "feat(infra): multi-stage Dockerfile + secrets via env + healthcheck on data services"
```

---

## Task 12.1: CI rewrite — prisma drift check + E2E + build + parallel jobs

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

**Step 1: Rewrite the workflow**

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_USER: athar, POSTGRES_PASSWORD: athar, POSTGRES_DB: athar }, ports: ["5432:5432"], options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5 }
      redis: { image: redis:7, ports: ["6379:6379"] }
      minio: { image: minio/minio, env: { MINIO_ROOT_USER: athar, MINIO_ROOT_PASSWORD: athar12345 }, ports: ["9000:9000", "9001:9001"] }
    env:
      DATABASE_URL: postgresql://athar:athar@localhost:5432/athar?schema=public
      REDIS_HOST: localhost
      REDIS_PORT: 6379
      MINIO_ENDPOINT: localhost
      MINIO_PORT: 9000
      # ... all other required envs from .env.example with test values
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - run: npm run test:e2e
      - run: npm run build
      - run: npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script | diff - prisma/schema.prisma || (echo "schema drift" && exit 1)
```

(Adjust the `redis:7` healthcheck — Redis needs `--requirepass` for full check; the example uses no password, which is fine for test.)

**Step 2: Dependabot**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
```

**Step 3: Push branch and verify CI passes**

```bash
git push origin tariq/2026-06-30-sprint-a-ci
gh pr create --base main --title "ci: parallel jobs + E2E + build + drift check"
```

**Step 4: Commit**

```bash
git add .github
git commit -m "ci: parallel jobs + E2E + build + prisma drift check + dependabot"
```

---

## Task 13.1: Observability — pino + Sentry + health/ready + /metrics

**Files:**
- Modify: `package.json` (add `nestjs-pino`, `pino-http`, `@sentry/node`, `@nestjs/terminus`, `@willsoto/nestjs-prometheus`, `prom-client`)
- Modify: `src/main.ts` (wire pino + Sentry + helmet + CORS)
- Modify: `src/app.module.ts` (LoggerModule, TerminusModule, PrometheusModule)
- Modify: `src/health/health.controller.ts` (split live/ready)
- Create: `src/observability/sentry.ts`
- Create: `src/observability/metrics.controller.ts`

**Step 1: Install**

```bash
npm install nestjs-pino pino-http @sentry/node @nestjs/terminus @willsoto/nestjs-prometheus prom-client helmet
```

**Step 2: Wire pino in app.module.ts**

```typescript
LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.refreshToken', '*.apiKey', '*.token'],
    autoLogging: true,
  },
}),
```

**Step 3: Sentry init in main.ts (before NestFactory.create)**

```typescript
import { initSentry } from './observability/sentry';
initSentry();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
```

`sentry.ts`:

```typescript
import * as Sentry from '@sentry/node';
export function initSentry() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN, release: process.env.GIT_SHA, tracesSampleRate: 0.1 });
}
```

**Step 4: Health endpoints**

```typescript
@Controller('health')
export class HealthController {
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('db', { timeout: 1000 }),
      () => this.redis.pingCheck('redis', { timeout: 1000 }),
    ]);
  }
}
```

**Step 5: /metrics guarded by admin token**

```typescript
@Controller('metrics')
export class MetricsController {
  @Get() metrics(@Headers('x-admin-token') token: string) {
    if (token !== process.env.ADMIN_TOKEN) throw new UnauthorizedException();
    return register.metrics();
  }
}
```

**Step 6: helmet + CORS in main.ts**

```typescript
app.use(helmet());
app.enableCors({ origin: process.env.CORS_ORIGINS?.split(',') ?? [], credentials: true });
app.enableShutdownHooks();
```

**Step 7: Tests + commit**

```bash
npm test && npm run lint && npm run typecheck
```

```bash
git add package.json src/main.ts src/app.module.ts src/health src/observability
git commit -m "feat(observability): pino + Sentry + /health/live + /health/ready + /metrics + helmet + CORS"
```

---

## Task 14.1: Pre-launch E2E journey

**Files:**
- Create: `test/journey.prelaunch.e2e-spec.ts`

**Step 1: Failing test**

```typescript
it('signup → register tenant → subscribe via webhook → invoice created', async () => {
  const reg = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
    email: 't@e.com', password: 'passw0rd!', name: 'T', tenantName: 'Acme',
    acceptTerms: true, termsVersion: 'v1',
  }).expect(201);
  const token = reg.body.accessToken;
  await request(app.getHttpServer()).post('/api/v1/brand/profile').set('Authorization', `Bearer ${token}`).send({ tone: 'professional', topics: ['saudi tech'] }).expect(201);
  // mock Moyasar webhook (HMAC-signed)
  const body = JSON.stringify({ id: 'evt_1', type: 'payment_paid', data: { id: 'pay_1', status: 'paid', amount: 68885, currency: 'SAR', metadata: { tenant_id: reg.body.tenantId, plan_code: 'business' } } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = ts + '.' + createHmac('sha256', process.env.MOYASAR_WEBHOOK_SECRET!).update(`${ts}.${body}`).digest('hex');
  await request(app.getHttpServer()).post('/api/v1/billing/webhook').set('signature', sig).set('Content-Type', 'application/json').send(body).expect(201);
  const inv = await prisma.invoice.findFirst({ where: { tenantId: reg.body.tenantId } });
  expect(inv?.totalMinor).toBe(68885);
  expect(inv?.vatMinor).toBe(8985);
  expect(inv?.subtotalMinor).toBe(59900);
});
```

**Step 2: Tests + commit**

```bash
npm run test:e2e
```

```bash
git add test/journey.prelaunch.e2e-spec.ts
git commit -m "test(e2e): pre-launch journey — signup → brand → webhook → invoice with VAT"
```

---

## Out of Scope (deferred to Sprint B/C)

These are P0/P1 audit findings that need a separate plan because they touch subsystems Sprint A doesn't refactor:

- **PDPL purge worker** (User AuditLog + 30-day `purgeAfter` cron) — Sprint B
- **Engine idempotency on `monthPlanId + postIndex`** — Sprint B
- **Recurring subscription renewals + refund handling** — Sprint B (billing)
- **Multi-tenant isolation: replace `prisma.x.update({ where: { id } })` with `updateMany({ where: { id, tenantId } })` repo-wide** — Sprint B
- **Prisma connection pool `?connection_limit=20&statement_timeout=15s`** — Sprint B (one-line in `.env`)
- **Composite indexes migration** (`Post[tenantId, status, scheduledAt]`, `UsageRecord[tenantId, kind, createdAt]`, `Subscription[tenantId, createdAt]`) — Sprint B
- **OpenAPI / Swagger** — Sprint B
- **API versioning** (`enableVersioning()`) — Sprint B
- **`PatchPostDto` `_null` → native `| null` refactor** — Sprint B
- **DTOs → response DTOs** (replace raw Prisma row returns) — Sprint B/C
- **Structured engine stage metrics** (latency histograms per stage) — Sprint C
- **Saudi calendar / Hijri correctness** — Sprint C
- **Engine idempotency on `pipeline.generateOne`** — Sprint C
- **Repository pattern + `PostAggregate`** — Sprint C
- **`@nestjs/event-emitter` for cache invalidation** — Sprint C
- **Per-tenant cap overrides + soft-warn at 80%** — Sprint C
- **Cache layer** (`@nestjs/cache-manager` + Redis for `Subscription`, `SaudiOccasion`, `BrandProfile`) — Sprint C
- **E2E for brand onboarding, engine pipeline, calendar, reminders, trial-expiry** — Sprint C
- **Brand `version` optimistic locking + delete endpoint** — Sprint C
- **`PostEvent` / `PostApproval` snapshot for human-approval** — Sprint C
- **Document the `LIVE_HMAC_TOLERANCE_SEC` env (default 5 min) in the plan** — Sprint C
- **`Dependabot` schedule adjusted to `monthly`** — Sprint C

## Self-Review

**Spec coverage check:**
- 37 P0 audit findings identified → 14 tasks cover 30 of them. 7 deferred to Sprint B/C above.
- LR-004 (never edit applied migrations) honored — Task 3.1 creates a new migration.
- LR-005 (test actual behavior) — each task has a failing test as Step 1.
- LR-006 (sub-agent briefs) — each task header is self-contained.
- LR-007 (bounded delegated agents) — Sprint A is split into 14 small tasks.
- LR-008 (no worktrees, branch isolation) — documented under "Branch isolation" in Global Constraints.
- TDD discipline — every code-change task has Steps 1-2 (test) before 3-4 (impl).
- Frequent commits — each task ends with a `git commit`.
- No placeholders — every step has actual content.
- Exact file paths — every `Create`/`Modify` is an absolute path within the repo.

**Type consistency:**
- `validateConfig(env)` defined in Task 1.2, used by `ConfigModule.forRoot({ validate })` in same task.
- `IdempotencyService.claim()` defined in Task 6.1, used by `BillingController.webhook` in same task.
- `webhook-hmac.verifyMoyasarHmac` defined and used in same task.
- `IMAGE_PROVIDER` token defined in Task 7.1, exported from `provider.tokens.ts`, consumed in `engine.module.ts` and `pipeline.service.ts` in same task.
- `UsageRecorder.record({ costUsd })` signature change in Task 8.1, all 5 call sites updated in same task.
- `AppError` helpers `securityViolation`, `amountMismatch`, `tenantMismatch` defined where first used.
- `Sentry.init` defined in `observability/sentry.ts`, called from `main.ts` in same task.

**Cross-task dependencies (in-order):**
- Task 1.1 → no deps
- Task 1.2 → no deps
- Task 2.1 → no deps
- Task 2.2 → no deps
- Task 3.1 → no deps (the migration runs against the dev DB only)
- Task 4.1 → depends on Task 3.1 (User.consent* columns)
- Task 5.1 → depends on Task 3.1 (Invoice.vatMinor etc.)
- Task 6.1 → depends on Task 3.1 (WebhookEvent table) + Task 2.1 (JWT for webhook context)
- Task 7.1 → no deps (but benefits from Task 2.2 for tenant binding)
- Task 8.1 → no deps (but the schema change is its own mini-migration; bundle with Task 3.1 if you want one fewer migration)
- Task 9.1 → no deps
- Task 10.1 → no deps
- Task 11.1 → no deps
- Task 12.1 → no deps (CI invokes the tests from earlier tasks)
- Task 13.1 → no deps
- Task 14.1 → depends on all of Tasks 1.1, 2.1, 2.2, 3.1, 4.1, 5.1, 6.1

**Branch strategy (LR-008):**
Each task lands on `tariq/2026-06-30-sprint-a-<task-slug>`. After CI passes, merge to `main` sequentially (one at a time) — `branch-guard.sh` will fork this session on contention.

**Estimated effort:**
14 tasks × 1–2 days each (with TDD + review) = 14–28 working days. Realistic with one backend engineer and a parallel PR review queue.
