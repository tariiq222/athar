# Phase 6 — Billing (Moyasar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tenants from `trialing` to paid `active` via Moyasar (mada / Apple Pay / cards), enforce monthly usage caps per kind (text/image/search), and issue a simple Invoice for every successful payment.

**Architecture:** New `BillingModule` owns: `MoyasarClient` (REST wrapper), `WebhookSignature` (constant-time token check), `BillingService` (subscribe/verify/issue/cancel/get), `BillingController` (5 routes under `/billing`). `UsageRecorder.canConsume(tenantId, kind)` replaces today's `isOverQuota()` with per-kind cap checks driven by a `PlanDefinition` config (`trial` vs `business`). Trial → `past_due` runs via a daily BullMQ job + lazy check at `canConsume`. Engine integration: `PipelineService` calls `canConsume` per stage (search/draft/image) instead of one pre-flight. New `Invoice` table via migration.

**Tech Stack:** NestJS 10, Prisma 7 (PostgreSQL), BullMQ (Redis), Node 20+ native `fetch`, `crypto.timingSafeEqual`, Moyasar REST (`api.moyasar.com/v1`).

**Spec:** [docs/specs/المرحلة-6-الفوترة.md](../specs/المرحلة-6-الفوترة.md)

## Global Constraints

- Code is English-only (CLAUDE.md). Arabic only in user-facing strings and error messages.
- All amounts in minor units (integer halalas); 599 SAR = `59900`. Never floats.
- Moyasar source-of-truth rule: every activation MUST `GET /v1/payments/:id` with `sk_*` and verify `status==='paid' && amount===expected && currency==='SAR' && metadata.tenant_id===ctx.tenantId`. Never trust the callback query string.
- Idempotency: send side uses `given_id = uuid v4` per `POST /payments`; receive side is idempotent on `payment.id`.
- Webhook security: `crypto.timingSafeEqual` on `secret_token`. Two-step: (1) signature, (2) re-fetch. Mismatch on either → drop with 401 (signature) or no-op (replay).
- Tenant isolation: every Prisma query on Subscription/UsageRecord/Invoice MUST go through `forTenant()` or be guarded by `tenantId` in the WHERE. Add `'Invoice'` to the `SCOPED_MODELS` set.
- Phase-local tables get their own migration (`Invoice` added by NEW migration; never edit an applied one — LR-004).
- Every AI call already records a `UsageRecord`; that contract is preserved (no behavior change to recording). Only the pre-check changes.
- Keep `EngineError('skipped_quota')` contract — MonthPlanProcessor already catches it. Do NOT change `PipelineResult` shape.
- Pre-existing test debt (`prisma.service.spec.ts` needs DATABASE_URL): out of scope, do NOT touch in this phase.
- No auto-publishing (CLAUDE.md). No refunds automation (spec §خارج النطاق). No ZATCA e-invoicing.

## Pre-Flight Findings

Verified against `main` at SHA `d930790` on 2026-06-29.

| Assumption in this plan | Reality on `main` | Resolution |
|---|---|---|
| `Subscription`/`UsageRecord` models need a new migration | Both exist since Sprint 0 with all spec-required fields (`status`, `plan`, `trialEndsAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `SubscriptionStatus` enum, `UsageRecord.kind/units/costUsd/subscriptionId`) | No migration on existing tables. Only `Invoice` is new. |
| `Invoice` model needs creation | Not in `prisma/schema.prisma` (comment only: `// Phase 6`) | New migration `20260629_phase6_invoice` adds `Invoice` model + `@@index([tenantId])`. |
| `UsageGuard.canConsume(tenantId, kind)` is a new service | `src/engine/usage/usage.recorder.ts` already exists with `record()` + `isOverQuota()` (single cap from `ENGINE_MONTHLY_UNIT_CAP`, kind-agnostic) | **Decision (user-confirmed):** extend `UsageRecorder` with `canConsume(tenantId, kind, planDef)` returning `ConsumeDecision`. Replace all `isOverQuota` callers. Add deprecated-marked wrapper for backward compat (kept to avoid breaking Phase 1 tests if any). Export `UsageRecorder` from `EngineModule`. |
| `EngineModule` exports `UsageRecorder` | Currently NOT exported (consumers inject directly via internal wiring) | Add to `exports: [..., UsageRecorder]` so `BillingModule` can inject it. |
| `PipelineService.generateOne` calls one pre-flight `isOverQuota` | Yes, at line 44: `if (await this.usage.isOverQuota(brand.tenantId)) throw new EngineError('usage cap reached', 'skipped_quota')` | Replace with three per-kind pre-checks (search → text/draft → image). Keep throwing `EngineError('skipped_quota', ...)` so MonthPlanProcessor keeps catching. |
| `LiveSearchProvider.research()` records search usage but does NOT pre-check | Confirmed — no pre-check at search time | Task 7 wires `canConsume('search')` before the fetch loop. |
| `AuthService.register` already creates `Subscription{status:'trialing', plan:'trial', trialEndsAt}` | Yes, `src/auth/auth.service.ts:43-50`, uses `TRIAL_DURATION_DAYS` env (default 7) | No auth changes needed. Phase 6 only consumes `trialEndsAt`. |
| TenantScope extension must include `Invoice` | Current `SCOPED_MODELS = ['AccountProfile','Post','BrandProfile','User','Subscription','UsageRecord']` at `src/prisma/tenant-scope.extension.ts:4-11` | Add `'Invoice'` to the set in this phase. |
| Moyasar client needs a new HTTP library | Node 20+ has native `fetch`; no extra dep needed | Use native `fetch` for `MoyasarClient`. |
| `given_id` (UUIDv4) needs `uuid` package | `package.json` already has `@prisma/client`, `bullmq`, `nodemailer`, `twitter-text`. No `uuid` listed. | Use `crypto.randomUUID()` (Node 19+) — no new dep. |
| Trial → `past_due` transition has no scheduler | Confirmed. BullMQ is wired (`BullModule.forRoot` in `app.module.ts:24-29`) | **Decision (user-confirmed):** daily BullMQ job (`trial-expiry` queue) + lazy check inside `canConsume` for sub-day precision. |
| New error codes follow `ERRORS` table pattern | Confirmed `src/common/errors/error-envelope.ts` (Phase 5 added 6 errors) | Add: `QUOTA_EXCEEDED`, `PAYMENT_FAILED`, `WEBHOOK_SIGNATURE_INVALID`, `WEBHOOK_REPLAY`, `INVOICE_NOT_FOUND`, `SUBSCRIPTION_CANCELED`. |
| `JWT_AUTH_GUARD` + `TENANT_GUARD` + `CurrentTenant` work for new routes | Confirmed pattern in `src/user/user.controller.ts` and `src/publishing/*` | Use same triple on `BillingController` for tenant-scoped routes. Webhook route is public (no guards). |

**Confirmed clean:** No existing `src/billing/`, no `Moyasar`/`moyasar` strings anywhere in `src/`, no existing `Invoice` model.

## File Structure

**New files:**
- `prisma/migrations/20260629_phase6_invoice/migration.sql` — Invoice table
- `src/config/billing-plans.ts` — `PlanDefinition` type + `BUSINESS_PLAN` + `TRIAL_PLAN` + `resolvePlan(plan)` helper
- `src/config/billing-plans.spec.ts` — unit tests
- `src/billing/moyasar.client.ts` — `MoyasarClient.createPaymentIntent`, `fetchPayment`
- `src/billing/moyasar.client.spec.ts` — unit tests (fetch mocked)
- `src/billing/webhook-signature.ts` — `verifyWebhookToken(received, expected)` with `crypto.timingSafeEqual`
- `src/billing/webhook-signature.spec.ts` — unit tests
- `src/billing/billing.types.ts` — `ConsumeDecision`, `MoyasarPayment`, `MoyasarEventType`, `PlanCode`, etc.
- `src/billing/dto/subscribe.dto.ts`, `dto/cancel.dto.ts`, `dto/plan-query.dto.ts` — request DTOs
- `src/billing/billing.service.ts` — all billing logic
- `src/billing/billing.service.spec.ts` — unit tests
- `src/billing/billing.controller.ts` — 5 routes
- `src/billing/billing.controller.spec.ts` — unit tests
- `src/billing/billing.module.ts` — wires everything
- `src/billing/trial-expiry.processor.ts` — BullMQ processor
- `src/billing/trial-expiry.processor.spec.ts`
- `test/billing.e2e-spec.ts` — end-to-end smoke (subscribe→webhook→subscription)

**Modified files:**
- `prisma/schema.prisma` — add `Invoice` model (after `UsageRecord`)
- `src/common/errors/error-envelope.ts` — add 6 billing errors + helpers
- `src/engine/usage/usage.recorder.ts` — add `canConsume(tenantId, kind, planDef)` returning `ConsumeDecision`; keep `isOverQuota` deprecated-marked
- `src/engine/usage/usage.recorder.spec.ts` — new tests for `canConsume`
- `src/engine/engine.module.ts` — export `UsageRecorder`
- `src/engine/pipeline/pipeline.service.ts` — replace `isOverQuota` with per-kind `canConsume`
- `src/engine/pipeline/pipeline.service.spec.ts` — update tests
- `src/engine/search/live-search.provider.ts` — add `canConsume('search')` pre-check
- `src/engine/search/live-search.provider.spec.ts` — update tests (if exists)
- `src/prisma/tenant-scope.extension.ts` — add `'Invoice'` to `SCOPED_MODELS`
- `src/app.module.ts` — register `BillingModule`
- `.env.example` — document new env vars (`MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_WEBHOOK_SECRET`, `BILLING_PUBLIC_URL`)

**Untouched (confirmed):** `AuthModule`, `AuthService.register` (Phase 3 already creates `trialing` Subscription), all of `src/accounts/`, `src/brand/`, `src/posts/`, `src/calendar/`, `src/notifications/`, `src/publishing/`, `src/occasions/`.

---

## Task 1: PlanDefinition config

**Files:**
- Create: `src/config/billing-plans.ts`
- Create: `src/config/billing-plans.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `export type PlanCode = 'trial' | 'business'`, `export interface PlanDefinition`, `export const TRIAL_PLAN: PlanDefinition`, `export const BUSINESS_PLAN: PlanDefinition`, `export function resolvePlan(code: string): PlanDefinition`

- [ ] **Step 1: Write failing test**

`src/config/billing-plans.spec.ts`:
```ts
import { TRIAL_PLAN, BUSINESS_PLAN, resolvePlan } from './billing-plans';

describe('billing-plans', () => {
  it('TRIAL_PLAN has zero price and 7-day trial', () => {
    expect(TRIAL_PLAN.code).toBe('trial');
    expect(TRIAL_PLAN.priceMinor).toBe(0);
    expect(TRIAL_PLAN.trialDays).toBe(7);
    expect(TRIAL_PLAN.monthlyDraftCap).toBeLessThan(BUSINESS_PLAN.monthlyDraftCap);
    expect(TRIAL_PLAN.monthlyImageCap).toBeLessThan(BUSINESS_PLAN.monthlyImageCap);
    expect(TRIAL_PLAN.monthlySearchCap).toBeLessThan(BUSINESS_PLAN.monthlySearchCap);
  });

  it('BUSINESS_PLAN is 59900 halalas (599 SAR)', () => {
    expect(BUSINESS_PLAN.code).toBe('business');
    expect(BUSINESS_PLAN.priceMinor).toBe(59900);
    expect(BUSINESS_PLAN.priceSar).toBe(599);
    expect(BUSINESS_PLAN.annualPriceMinor).toBeLessThan(BUSINESS_PLAN.priceMinor * 12);
  });

  it('resolvePlan returns the matching plan; unknown throws', () => {
    expect(resolvePlan('trial').code).toBe('trial');
    expect(resolvePlan('business').code).toBe('business');
    expect(() => resolvePlan('enterprise')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- billing-plans`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/config/billing-plans.ts`:
```ts
export type PlanCode = 'trial' | 'business';

export interface PlanDefinition {
  code: PlanCode;
  nameAr: string;
  priceSar: number;
  priceMinor: number;
  annualPriceMinor: number;
  billingCycle: 'monthly' | 'annual';
  trialDays: number;
  monthlyDraftCap: number;
  monthlyImageCap: number;
  monthlySearchCap: number;
}

export const TRIAL_PLAN: PlanDefinition = {
  code: 'trial',
  nameAr: 'تجربة مجانية',
  priceSar: 0,
  priceMinor: 0,
  annualPriceMinor: 0,
  billingCycle: 'monthly',
  trialDays: 7,
  monthlyDraftCap: 10,
  monthlyImageCap: 5,
  monthlySearchCap: 10,
};

export const BUSINESS_PLAN: PlanDefinition = {
  code: 'business',
  nameAr: 'أعمال',
  priceSar: 599,
  priceMinor: 59900,
  annualPriceMinor: 59900 * 10, // 2 months free on annual
  billingCycle: 'monthly',
  trialDays: 0,
  monthlyDraftCap: 60,
  monthlyImageCap: 30,
  monthlySearchCap: 200,
};

const PLANS: Record<PlanCode, PlanDefinition> = {
  trial: TRIAL_PLAN,
  business: BUSINESS_PLAN,
};

export function resolvePlan(code: string): PlanDefinition {
  const plan = PLANS[code as PlanCode];
  if (!plan) throw new Error(`Unknown plan code: ${code}`);
  return plan;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- billing-plans`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/billing-plans.ts src/config/billing-plans.spec.ts
git commit -m "feat(billing): add PlanDefinition config (trial + business)"
```

---

## Task 2: Invoice model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add `Invoice` model after `UsageRecord`)
- Create: `prisma/migrations/20260629_phase6_invoice/migration.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `Invoice` model with `id`, `tenantId`, `subscriptionId`, `moyasarPaymentId` (unique), `number`, `issuedAt`, `totalMinor`, `currency`, `sellerName`, `buyerName`, `status`, indexed on `tenantId`

- [ ] **Step 1: Add Invoice model to schema**

Append after the `UsageRecord` model in `prisma/schema.prisma`:
```prisma
// Phase 6 — billing (FR-15). Added by a NEW migration.
model Invoice {
  id               String   @id @default(cuid())
  tenantId         String
  subscriptionId   String
  moyasarPaymentId String   @unique
  number           String
  issuedAt         DateTime @default(now())
  totalMinor       Int
  currency         String   @default("SAR")
  sellerName       String
  buyerName        String
  status           String   @default("issued") // 'issued' | 'refunded'

  tenant       Tenant       @relation(fields: [tenantId], references: [id])
  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@unique([tenantId, number])
  @@index([tenantId])
}
```

Add the `Invoice[]` back-relation on `Tenant`:
```prisma
model Tenant {
  // ... existing fields
  invoices      Invoice[]
}
```

Add the `Invoice[]` back-relation on `Subscription`:
```prisma
model Subscription {
  // ... existing fields
  invoices Invoice[]
}
```

- [ ] **Step 2: Create the migration SQL**

```bash
mkdir -p prisma/migrations/20260629_phase6_invoice
```

Create `prisma/migrations/20260629_phase6_invoice/migration.sql`:
```sql
-- Phase 6 — billing. Adds Invoice table.
CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "moyasarPaymentId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'SAR',
  "sellerName" TEXT NOT NULL,
  "buyerName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_moyasarPaymentId_key" ON "Invoice"("moyasarPaymentId");
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: client regenerated; `src/generated/prisma` picks up the new model.

- [ ] **Step 4: Verify with typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260629_phase6_invoice/
git commit -m "feat(billing): add Invoice model + migration (Phase 6)"
```

---

## Task 3: Billing error codes

**Files:**
- Modify: `src/common/errors/error-envelope.ts`

- [ ] **Step 1: Write failing test**

Append to `src/common/errors/error-envelope.spec.ts` (or create a new file if existing tests cover the full `ERRORS` table):

```ts
import { quotaExceeded, paymentFailed, webhookSignatureInvalid, invoiceNotFound } from './error-envelope';

describe('billing errors', () => {
  it('quotaExceeded returns Arabic reason and 402', () => {
    const e = quotaExceeded('text', 60, 60);
    expect(e.getStatus()).toBe(402);
    expect(e.getEnvelope().error).toBe('QUOTA_EXCEEDED');
    expect(e.getEnvelope().message).toContain('المسودّات');
    expect(e.getEnvelope().message).toContain('60');
  });

  it('paymentFailed returns 402', () => {
    expect(paymentFailed('declined').getStatus()).toBe(402);
  });

  it('webhookSignatureInvalid returns 401', () => {
    expect(webhookSignatureInvalid().getStatus()).toBe(401);
  });

  it('invoiceNotFound returns 404', () => {
    expect(invoiceNotFound().getStatus()).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- error-envelope`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

In `src/common/errors/error-envelope.ts`, add inside the `ERRORS` object (before the closing `as const`):

```ts
// Phase 6 — billing (FR-15)
QUOTA_EXCEEDED: {
  statusCode: 402,
  error: 'QUOTA_EXCEEDED',
  message: 'تجاوزت سقف الباقة.',
},
PAYMENT_FAILED: {
  statusCode: 402,
  error: 'PAYMENT_FAILED',
  message: 'فشلت عملية الدفع.',
},
WEBHOOK_SIGNATURE_INVALID: {
  statusCode: 401,
  error: 'WEBHOOK_SIGNATURE_INVALID',
  message: 'توقيع الـwebhook غير صالح.',
},
INVOICE_NOT_FOUND: {
  statusCode: 404,
  error: 'INVOICE_NOT_FOUND',
  message: 'الفاتورة غير موجودة.',
},
```

Add helpers at the bottom of the file:

```ts
export const quotaExceeded = (kind: string, used: number, cap: number) =>
  new AppError(
    402,
    'QUOTA_EXCEEDED',
    `بلغت سقف الباقة الشهري (${used}/${cap}) لـ${kindLabel(kind)}.`,
  );

export const paymentFailed = (reason: string) =>
  new AppError(402, 'PAYMENT_FAILED', `فشلت عملية الدفع: ${reason}.`);

export const webhookSignatureInvalid = () => make(ERRORS.WEBHOOK_SIGNATURE_INVALID);

export const invoiceNotFound = () => make(ERRORS.INVOICE_NOT_FOUND);

function kindLabel(kind: string): string {
  return { text: 'المسودّات', image: 'الصور', search: 'عمليات البحث' }[kind] ?? kind;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- error-envelope`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/common/errors/error-envelope.ts src/common/errors/error-envelope.spec.ts
git commit -m "feat(billing): add QUOTA_EXCEEDED + webhook/invoice errors"
```

---

## Task 4: Webhook signature helper

**Files:**
- Create: `src/billing/webhook-signature.ts`
- Create: `src/billing/webhook-signature.spec.ts`

- [ ] **Step 1: Write failing test**

`src/billing/webhook-signature.spec.ts`:
```ts
import { timingSafeEqual } from 'crypto';
import { verifyWebhookToken } from './webhook-signature';

describe('verifyWebhookToken', () => {
  it('returns true on matching tokens', () => {
    expect(verifyWebhookToken('abc123', 'abc123')).toBe(true);
  });

  it('returns false on mismatch', () => {
    expect(verifyWebhookToken('abc123', 'xyz999')).toBe(false);
  });

  it('returns false on different lengths', () => {
    expect(verifyWebhookToken('short', 'much-longer-token')).toBe(false);
  });

  it('uses constant-time comparison (no early-exit on mismatch)', () => {
    // We can only assert behavior, not timing — but ensure equal-length mismatches still return false.
    expect(verifyWebhookToken('aaaa', 'bbbb')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- webhook-signature`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/billing/webhook-signature.ts`:
```ts
import { timingSafeEqual } from 'crypto';

export function verifyWebhookToken(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  if (received.length !== expected.length) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- webhook-signature`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/billing/webhook-signature.ts src/billing/webhook-signature.spec.ts
git commit -m "feat(billing): constant-time webhook signature verify"
```

---

## Task 5: MoyasarClient (createPaymentIntent + fetchPayment)

**Files:**
- Create: `src/billing/moyasar.client.ts`
- Create: `src/billing/moyasar.client.spec.ts`
- Create: `src/billing/billing.types.ts`

- [ ] **Step 1: Write shared types**

`src/billing/billing.types.ts`:
```ts
export type MoyasarEventType =
  | 'payment_paid'
  | 'payment_failed'
  | 'payment_refunded'
  | 'invoice_paid'
  | 'invoice_expired';

export type MoyasarPaymentStatus = 'initiated' | 'paid' | 'failed' | 'refunded';

export interface MoyasarPaymentSource {
  type: 'creditcard' | 'applepay' | 'stcpay';
  company?: 'mada' | 'visa' | 'mastercard' | 'amex';
  transaction_url?: string;
  message?: string;
}

export interface MoyasarPayment {
  id: string;
  status: MoyasarPaymentStatus;
  amount: number;
  currency: 'SAR';
  source: MoyasarPaymentSource;
  metadata: { tenant_id: string; plan_code: string; cycle: string };
}

export interface MoyasarWebhookEvent {
  id: string;
  type: MoyasarEventType;
  created_at: string;
  secret_token: string;
  data: MoyasarPayment;
}

export interface CreatePaymentInput {
  amount: number; // minor units
  givenId: string; // UUID for idempotency
  callbackUrl: string;
  metadata: { tenant_id: string; plan_code: string; cycle: string };
  description: string;
}
```

- [ ] **Step 2: Write failing test**

`src/billing/moyasar.client.spec.ts`:
```ts
import { MoyasarClient } from './moyasar.client';

describe('MoyasarClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createPaymentIntent POSTs to /v1/payments with Basic Auth and given_id', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ id: 'pay_1', status: 'initiated', amount: 59900, currency: 'SAR', source: { type: 'creditcard', transaction_url: 'https://3ds' }, metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }) as any;

    const client = new MoyasarClient({ secretKey: 'sk_test_x', baseUrl: 'https://api.moyasar.com/v1' });
    const out = await client.createPaymentIntent({
      amount: 59900,
      givenId: 'uuid-1',
      callbackUrl: 'https://app/billing/callback',
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      description: 'Athar subscription',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.moyasar.com/v1/payments');
    expect(calls[0].init.headers.Authorization).toBe('Basic ' + Buffer.from('sk_test_x:').toString('base64'));
    expect(JSON.parse(calls[0].init.body).given_id).toBe('uuid-1');
    expect(out.id).toBe('pay_1');
  });

  it('fetchPayment GETs /v1/payments/:id and parses', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ id: 'pay_1', status: 'paid', amount: 59900, currency: 'SAR', source: { type: 'creditcard' }, metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as any;
    const client = new MoyasarClient({ secretKey: 'sk_test_x', baseUrl: 'https://api.moyasar.com/v1' });
    const out = await client.fetchPayment('pay_1');
    expect(out.status).toBe('paid');
  });

  it('throws on non-2xx response with the body', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ message: 'invalid amount' }), { status: 422, headers: { 'content-type': 'application/json' } }),
    ) as any;
    const client = new MoyasarClient({ secretKey: 'sk_test_x', baseUrl: 'https://api.moyasar.com/v1' });
    await expect(client.fetchPayment('bad')).rejects.toThrow(/invalid amount/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- moyasar.client`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`src/billing/moyasar.client.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { MoyasarPayment, CreatePaymentInput } from './billing.types';

interface MoyasarConfig {
  secretKey: string;
  baseUrl: string;
}

@Injectable()
export class MoyasarClient {
  constructor(private readonly config: MoyasarConfig) {}

  static fromSecret(secretKey: string, baseUrl = 'https://api.moyasar.com/v1'): MoyasarClient {
    return new MoyasarClient({ secretKey, baseUrl });
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.config.secretKey}:`).toString('base64');
  }

  async createPaymentIntent(input: CreatePaymentInput): Promise<MoyasarPayment> {
    const body = {
      amount: input.amount,
      currency: 'SAR',
      description: input.description,
      callback_url: input.callbackUrl,
      given_id: input.givenId,
      metadata: input.metadata,
      source: { type: 'creditcard' },
    };
    const res = await fetch(`${this.config.baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async fetchPayment(id: string): Promise<MoyasarPayment> {
    const res = await fetch(`${this.config.baseUrl}/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.authHeader() },
    });
    return this.parse(res);
  }

  private async parse(res: Response): Promise<MoyasarPayment> {
    const text = await res.text();
    if (!res.ok) throw new Error(`Moyasar ${res.status}: ${text}`);
    return JSON.parse(text) as MoyasarPayment;
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- moyasar.client`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/billing/moyasar.client.ts src/billing/moyasar.client.spec.ts src/billing/billing.types.ts
git commit -m "feat(billing): MoyasarClient (createPaymentIntent + fetchPayment)"
```

---

## Task 6: UsageRecorder.canConsume() extension + plan lookup

**Files:**
- Modify: `src/engine/usage/usage.recorder.ts`
- Modify: `src/engine/usage/usage.recorder.spec.ts`
- Modify: `src/engine/engine.module.ts` (export `UsageRecorder`)

**Interfaces:**
- Consumes: `PlanDefinition` (Task 1), existing `PrismaService`
- Produces: `canConsume(tenantId: string, kind: 'text'|'image'|'search', planDef: PlanDefinition): Promise<ConsumeDecision>`, `getCurrentPlan(tenantId: string): Promise<PlanDefinition>` (reads active Subscription)

- [ ] **Step 1: Add ConsumeDecision to types**

In `src/engine/usage/usage.recorder.ts`, add:
```ts
import { PlanDefinition, resolvePlan } from '../../config/billing-plans';
import type { Subscription } from '../../generated/prisma/models/Subscription';

export interface ConsumeDecision {
  allowed: boolean;
  used: number;
  cap: number;
  reason?: string;
}
```

(Adjust the import path if `generated/prisma/models/Subscription` doesn't export — fall back to inline `{ plan: string; status: string; trialEndsAt: Date | null }` typing.)

- [ ] **Step 2: Write failing tests**

Append to `src/engine/usage/usage.recorder.spec.ts`:
```ts
import { TRIAL_PLAN, BUSINESS_PLAN } from '../../config/billing-plans';

describe('UsageRecorder.canConsume', () => {
  function makeRecorder(usage: Array<{ kind: string; units: number; tenantId: string; createdAt?: Date }>, subscription?: { plan: string; status: string; trialEndsAt: Date | null }) {
    const prisma = {
      usageRecord: {
        create: jest.fn(),
        aggregate: jest.fn(async ({ where }: any) => {
          const sum = usage
            .filter((u) => u.tenantId === where.tenantId && u.kind === (where.kind ?? u.kind) && (!where.createdAt || u.createdAt >= where.createdAt.gte))
            .reduce((acc, u) => acc + u.units, 0);
          return { _sum: { units: sum } };
        }),
      },
      subscription: {
        findFirst: jest.fn(async () => subscription ?? null),
      },
    } as any;
    return new UsageRecorder(prisma);
  }

  it('allows when used < cap', async () => {
    const rec = makeRecorder([{ kind: 'text', units: 5, tenantId: 't1' }], { plan: 'business', status: 'active', trialEndsAt: null });
    const d = await rec.canConsume('t1', 'text', BUSINESS_PLAN);
    expect(d.allowed).toBe(true);
    expect(d.used).toBe(5);
    expect(d.cap).toBe(60);
  });

  it('denies when used >= cap with Arabic reason', async () => {
    const rec = makeRecorder([{ kind: 'image', units: 30, tenantId: 't1' }], { plan: 'business', status: 'active', trialEndsAt: null });
    const d = await rec.canConsume('t1', 'image', BUSINESS_PLAN);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('الصور');
    expect(d.reason).toContain('30');
  });

  it('denies past_due regardless of count', async () => {
    const rec = makeRecorder([], { plan: 'business', status: 'past_due', trialEndsAt: null });
    const d = await rec.canConsume('t1', 'search', BUSINESS_PLAN);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('past_due');
  });

  it('denies canceled regardless of count', async () => {
    const rec = makeRecorder([], { plan: 'business', status: 'canceled', trialEndsAt: null });
    const d = await rec.canConsume('t1', 'search', BUSINESS_PLAN);
    expect(d.allowed).toBe(false);
  });

  it('uses trial plan for trialing tenants', async () => {
    const rec = makeRecorder([], { plan: 'trial', status: 'trialing', trialEndsAt: new Date(Date.now() + 86400_000) });
    const d = await rec.getCurrentPlan('t1');
    expect(d.code).toBe('trial');
    const c = await rec.canConsume('t1', 'text', d);
    expect(c.cap).toBe(10);
  });

  it('falls back to TRIAL_PLAN when no subscription row exists (defensive)', async () => {
    const rec = makeRecorder([]);
    const d = await rec.getCurrentPlan('t1');
    expect(d.code).toBe('trial');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- usage.recorder`
Expected: FAIL — `canConsume`/`getCurrentPlan` not defined.

- [ ] **Step 4: Implement canConsume + getCurrentPlan**

In `src/engine/usage/usage.recorder.ts`, add to the class:

```ts
async getCurrentPlan(tenantId: string): Promise<PlanDefinition> {
  const sub = await this.prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) return resolvePlan('trial');
  return resolvePlan(sub.plan);
}

async canConsume(
  tenantId: string,
  kind: 'text' | 'image' | 'search',
  planDef: PlanDefinition,
): Promise<ConsumeDecision> {
  const sub = await this.prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  const status = sub?.status ?? 'trialing';

  if (status === 'past_due' || status === 'canceled') {
    return { allowed: false, used: 0, cap: 0, reason: `الاشتراك ${status === 'past_due' ? 'متأخّر السداد' : 'ملغى'}؛ جدّد للاستمرار.` };
  }

  // Lazy trial-expiry check: trial ended without payment.
  if (status === 'trialing' && sub?.trialEndsAt && sub.trialEndsAt < new Date()) {
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'past_due' },
    });
    return { allowed: false, used: 0, cap: 0, reason: 'انتهت التجربة المجانية؛ يلزم الاشتراك.' };
  }

  const cap = (
    { text: planDef.monthlyDraftCap, image: planDef.monthlyImageCap, search: planDef.monthlySearchCap } as const
  )[kind];

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const agg = await this.prisma.usageRecord.aggregate({
    _sum: { units: true },
    where: { tenantId, kind, createdAt: { gte: startOfMonth } },
  });
  const used = agg._sum.units ?? 0;

  if (used >= cap) {
    const kindAr = { text: 'المسودّات', image: 'الصور', search: 'عمليات البحث' }[kind];
    return { allowed: false, used, cap, reason: `بلغت سقف ${kindAr} الشهري (${used}/${cap}).` };
  }

  return { allowed: true, used, cap };
}
```

Keep `isOverQuota()` as-is (deprecated-marked for the in-line usage in `pipeline.service.ts` and `live-search.provider.ts` — removed in Task 7).

- [ ] **Step 5: Export from EngineModule**

In `src/engine/engine.module.ts`, add `UsageRecorder` to `exports`:

```ts
exports: [
  PipelineService,
  MonthPlanService,
  LearningService,
  UsageRecorder,
  'ContentProvider',
  'ImageProvider',
  'SearchProvider',
],
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- usage.recorder`
Expected: existing 3 tests + 6 new tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/usage/usage.recorder.ts src/engine/usage/usage.recorder.spec.ts src/engine/engine.module.ts
git commit -m "feat(engine): UsageRecorder.canConsume per-kind + plan-aware; export from EngineModule"
```

---

## Task 7: Wire PipelineService + LiveSearchProvider to canConsume

**Files:**
- Modify: `src/engine/pipeline/pipeline.service.ts`
- Modify: `src/engine/pipeline/pipeline.service.spec.ts`
- Modify: `src/engine/search/live-search.provider.ts`

- [ ] **Step 1: Update LiveSearchProvider**

In `src/engine/search/live-search.provider.ts`, replace the start of `research`:

```ts
async research(topic: string, brand: BrandProfileInput): Promise<FactSet> {
  const plan = await this.usage.getCurrentPlan(brand.tenantId);
  const decision = await this.usage.canConsume(brand.tenantId, 'search', plan);
  if (!decision.allowed) {
    throw new EngineError(decision.reason ?? 'search quota exceeded', 'skipped_quota');
  }

  const whitelist = buildWhitelist(brand);
  const maxFetches = Number(process.env.ENGINE_SEARCH_MAX_FETCHES ?? 5);

  // ... rest unchanged
}
```

Import `EngineError` from `../types` (add at top if missing).

- [ ] **Step 2: Update PipelineService**

In `src/engine/pipeline/pipeline.service.ts`, replace the `isOverQuota` check:

```ts
async generateOne(req: GenerationRequest, monthPlanId?: string): Promise<PipelineResult> {
  const { brandProfile: brand, platform, contentType } = req;

  // Per-kind pre-check: search runs implicitly through research() below;
  // text and image get their own check here.
  const plan = await this.usage.getCurrentPlan(brand.tenantId);
  const textDecision = await this.usage.canConsume(brand.tenantId, 'text', plan);
  if (!textDecision.allowed) {
    throw new EngineError(textDecision.reason ?? 'text quota exceeded', 'skipped_quota');
  }

  const topic = req.topic ?? brand.topics[0] ?? '';
  const factSet = await this.search.research(topic, brand); // also pre-checks 'search'

  // ... draft + critique unchanged ...

  const imageDecision = await this.usage.canConsume(brand.tenantId, 'image', plan);
  if (!imageDecision.allowed) {
    throw new EngineError(imageDecision.reason ?? 'image quota exceeded', 'skipped_quota');
  }

  // ... image generation unchanged ...
}
```

The image stage check goes between the critique stage (which records text usage) and the image call.

- [ ] **Step 3: Update existing tests**

`src/engine/pipeline/pipeline.service.spec.ts` — its current `UsageRecorder` mock exposes only `record` and `isOverQuota`. Add `getCurrentPlan` and `canConsume` mocks returning `{ allowed: true }`:

```ts
const usageMock = {
  record: jest.fn(),
  isOverQuota: jest.fn().mockResolvedValue(false), // keep for back-compat
  getCurrentPlan: jest.fn().mockResolvedValue(BUSINESS_PLAN),
  canConsume: jest.fn().mockResolvedValue({ allowed: true, used: 0, cap: 60 }),
};
```

Add a new test that asserts `canConsume('text',...)` and `canConsume('image',...)` are both called and, when one denies, `EngineError('skipped_quota')` is thrown.

- [ ] **Step 4: Run tests**

Run: `npm test -- pipeline.service live-search`
Expected: existing + new tests pass.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/pipeline/pipeline.service.ts src/engine/pipeline/pipeline.service.spec.ts src/engine/search/live-search.provider.ts
git commit -m "feat(engine): per-kind canConsume checks in pipeline + search"
```

---

## Task 8: TenantScope — add 'Invoice'

**Files:**
- Modify: `src/prisma/tenant-scope.extension.ts`

- [ ] **Step 1: Add 'Invoice' to SCOPED_MODELS**

```ts
const SCOPED_MODELS = new Set([
  'AccountProfile',
  'Post',
  'BrandProfile',
  'User',
  'Subscription',
  'UsageRecord',
  'Invoice',
]);
```

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tenant-scope`
Expected: 0 errors; existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/prisma/tenant-scope.extension.ts
git commit -m "feat(prisma): scope Invoice in TenantScope extension"
```

---

## Task 9: Trial expiry BullMQ job

**Files:**
- Create: `src/billing/trial-expiry.processor.ts`
- Create: `src/billing/trial-expiry.processor.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (via `@nestjs/bullmq` Processor)
- Produces: `TrialExpiryProcessor` exporting a function `runOnce()` that finds expired `trialing` subscriptions and transitions them to `past_due`

- [ ] **Step 1: Write failing test**

`src/billing/trial-expiry.processor.spec.ts`:
```ts
import { TrialExpiryProcessor } from './trial-expiry.processor';

describe('TrialExpiryProcessor', () => {
  it('transitions expired trialing subscriptions to past_due', async () => {
    const updates: any[] = [];
    const prisma = {
      subscription: {
        findMany: jest.fn(async () => [{ id: 's1', tenantId: 't1', status: 'trialing', trialEndsAt: new Date(Date.now() - 1000) }]),
        update: jest.fn(async ({ where, data }: any) => { updates.push({ where, data }); return { where, data }; }),
      },
    } as any;
    const proc = new TrialExpiryProcessor(prisma);
    const n = await proc.runOnce();
    expect(n).toBe(1);
    expect(updates[0]).toEqual({ where: { id: 's1' }, data: { status: 'past_due' } });
  });

  it('skips active subscriptions', async () => {
    const prisma = {
      subscription: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    } as any;
    const proc = new TrialExpiryProcessor(prisma);
    const n = await proc.runOnce();
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trial-expiry.processor`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/billing/trial-expiry.processor.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export const TRIAL_EXPIRY_QUEUE = 'trial-expiry';

@Injectable()
@Processor(TRIAL_EXPIRY_QUEUE)
export class TrialExpiryProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<number> {
    return this.runOnce();
  }

  async runOnce(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'trialing', trialEndsAt: { lt: now } },
      select: { id: true },
    });
    for (const s of expired) {
      await this.prisma.subscription.update({
        where: { id: s.id },
        data: { status: 'past_due' },
      });
    }
    return expired.length;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- trial-expiry.processor`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/billing/trial-expiry.processor.ts src/billing/trial-expiry.processor.spec.ts
git commit -m "feat(billing): daily trial-expiry processor (trialing -> past_due)"
```

---

## Task 10: BillingService — subscribe/verify/issue/cancel/get

**Files:**
- Create: `src/billing/billing.service.ts`
- Create: `src/billing/billing.service.spec.ts`
- Create: `src/billing/dto/subscribe.dto.ts`
- Create: `src/billing/dto/cancel.dto.ts`

- [ ] **Step 1: DTOs**

`src/billing/dto/subscribe.dto.ts`:
```ts
import { IsIn, IsString } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @IsIn(['business'])
  planCode!: 'business';

  @IsString()
  @IsIn(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';
}
```

`src/billing/dto/cancel.dto.ts`:
```ts
import { IsBoolean } from 'class-validator';

export class CancelDto {
  @IsBoolean()
  confirm!: boolean;
}
```

- [ ] **Step 2: Write failing tests**

`src/billing/billing.service.spec.ts` (sketch — full file ~250 lines):
```ts
import { BillingService } from './billing.service';
import { BUSINESS_PLAN, TRIAL_PLAN } from '../config/billing-plans';

describe('BillingService', () => {
  function makeSvc(opts: any = {}) {
    const prisma = {
      subscription: {
        findFirst: opts.findFirst ?? (async () => ({ id: 's1', plan: 'trial', status: 'trialing', trialEndsAt: new Date(Date.now() + 86400_000) })),
        update: opts.update ?? (async ({ where, data }: any) => ({ id: where.id, ...data })),
      },
      invoice: {
        create: opts.createInvoice ?? (async ({ data }: any) => ({ id: 'inv_1', number: data.number, ...data })),
      },
      tenant: {
        findFirst: opts.findTenant ?? (async () => ({ id: 't1', name: 'Acme' })),
      },
      $transaction: opts.transaction ?? (async (fn: any) => fn(opts.txPrisma ?? {})),
    } as any;
    const moyasar = opts.moyasar ?? {
      createPaymentIntent: async () => ({ id: 'pay_1', status: 'initiated', amount: 59900, currency: 'SAR', source: { type: 'creditcard', transaction_url: 'https://3ds.example' }, metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } }),
      fetchPayment: async () => ({ id: 'pay_1', status: 'paid', amount: 59900, currency: 'SAR', source: { type: 'creditcard' }, metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } }),
    };
    const config = {
      get: (k: string) => ({ MOYASAR_SECRET_KEY: 'sk_test_x', BILLING_PUBLIC_URL: 'https://app', SELLER_NAME: 'أثر', INVOICE_NUMBER_PREFIX: 'INV' })[k],
    } as any;
    const svc = new BillingService(prisma, moyasar, config);
    return { svc, prisma, moyasar };
  }

  describe('createSubscriptionIntent', () => {
    it('returns Moyasar init params with metadata + given_id + publishableKey', async () => {
      const { svc } = makeSvc();
      const out = await svc.createSubscriptionIntent({ tenantId: 't1', userId: 'u1', planCode: 'business', cycle: 'monthly' });
      expect(out.amount).toBe(59900);
      expect(out.currency).toBe('SAR');
      expect(out.metadata.tenant_id).toBe('t1');
      expect(out.metadata.cycle).toBe('monthly');
      expect(out.givenId).toMatch(/^sub:t1:/);
      expect(out.callbackUrl).toContain('/billing/callback');
    });
  });

  describe('verifyAndActivate', () => {
    it('on paid+matching metadata activates subscription and issues invoice', async () => {
      const updates: any[] = [];
      const invoices: any[] = [];
      const { svc } = makeSvc({
        update: async ({ where, data }: any) => { updates.push({ where, data }); return { id: where.id, ...data }; },
        createInvoice: async ({ data }: any) => { invoices.push(data); return { id: 'inv_1', ...data }; },
      });
      const out = await svc.verifyAndActivate('pay_1', { tenantId: 't1' });
      expect(out.status).toBe('active');
      expect(invoices).toHaveLength(1);
      expect(invoices[0].tenantId).toBe('t1');
      expect(invoices[0].totalMinor).toBe(59900);
    });

    it('rejects when amount mismatch', async () => {
      const { svc } = makeSvc({
        moyasar: { fetchPayment: async () => ({ id: 'pay_1', status: 'paid', amount: 1, currency: 'SAR', source: { type: 'creditcard' }, metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } }) },
      });
      await expect(svc.verifyAndActivate('pay_1', { tenantId: 't1' })).rejects.toThrow(/amount/i);
    });

    it('rejects when tenant_id mismatch', async () => {
      const { svc } = makeSvc({
        moyasar: { fetchPayment: async () => ({ id: 'pay_1', status: 'paid', amount: 59900, currency: 'SAR', source: { type: 'creditcard' }, metadata: { tenant_id: 't_other', plan_code: 'business', cycle: 'monthly' } }) },
      });
      await expect(svc.verifyAndActivate('pay_1', { tenantId: 't1' })).rejects.toThrow(/tenant/i);
    });

    it('rejects non-paid status', async () => {
      const { svc } = makeSvc({
        moyasar: { fetchPayment: async () => ({ id: 'pay_1', status: 'failed', amount: 59900, currency: 'SAR', source: { type: 'creditcard', message: 'declined' }, metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } }) },
      });
      await expect(svc.verifyAndActivate('pay_1', { tenantId: 't1' })).rejects.toThrow();
    });
  });

  describe('handleWebhookEvent', () => {
    it('payment_paid activates (idempotent on payment.id)', async () => {
      // ...similar
    });

    it('payment_failed transitions active/trialing to past_due', async () => {
      // ...
    });

    it('replay (existing payment_id already processed) returns 200 without side effect', async () => {
      // ...
    });
  });

  describe('cancel', () => {
    it('sets canceled and cancelAtPeriodEnd on the latest subscription', async () => {
      const updates: any[] = [];
      const { svc } = makeSvc({
        findFirst: async () => ({ id: 's1', plan: 'business', status: 'active', trialEndsAt: null }),
        update: async ({ where, data }: any) => { updates.push({ where, data }); return { id: where.id, ...data }; },
      });
      const out = await svc.cancel('t1');
      expect(out.status).toBe('canceled');
      expect(updates[0].data.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('getSubscription', () => {
    it('returns status + plan + usage counts per kind', async () => {
      const { svc } = makeSvc({
        findFirst: async () => ({ id: 's1', plan: 'business', status: 'active', trialEndsAt: null, currentPeriodEnd: new Date() }),
      });
      const out = await svc.getSubscription('t1');
      expect(out.status).toBe('active');
      expect(out.usage.drafts).toBeDefined();
    });
  });

  describe('getInvoice', () => {
    it('throws invoiceNotFound when invoice belongs to other tenant', async () => {
      // ...
    });
  });
});
```

(Adjust counts to satisfy coverage; the spec for `verifyAndActivate` is the heart of the security contract — test amount/currency/tenant_id/status all four axes.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- billing.service`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`src/billing/billing.service.ts` (sketch — ~250 lines):
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MoyasarClient } from './moyasar.client';
import { BUSINESS_PLAN, PlanCode, PlanDefinition, resolvePlan } from '../config/billing-plans';
import { MoyasarPayment, MoyasarWebhookEvent } from './billing.types';
import { invoiceNotFound, paymentFailed } from '../common/errors/error-envelope';

interface TenantCtx { tenantId: string; userId: string }

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moyasar: MoyasarClient,
    private readonly config: ConfigService,
  ) {}

  async createSubscriptionIntent(ctx: TenantCtx, planCode: PlanCode, cycle: 'monthly' | 'annual') {
    const plan = resolvePlan(planCode);
    const priceMinor = cycle === 'annual' ? plan.annualPriceMinor : plan.priceMinor;
    const givenId = `sub:${ctx.tenantId}:${randomUUID()}`;
    const callbackUrl = `${this.config.get<string>('BILLING_PUBLIC_URL')}/billing/callback`;
    const metadata = { tenant_id: ctx.tenantId, plan_code: planCode, cycle };

    const payment = await this.moyasar.createPaymentIntent({
      amount: priceMinor,
      givenId,
      callbackUrl,
      metadata,
      description: `Athar subscription (${planCode})`,
    });

    return {
      paymentId: payment.id,
      givenId,
      amount: priceMinor,
      currency: 'SAR' as const,
      callbackUrl,
      publishableKey: this.config.get<string>('MOYASAR_PUBLISHABLE_KEY'),
      metadata,
      status: payment.status,
      transactionUrl: payment.source.transaction_url ?? null,
    };
  }

  async verifyAndActivate(paymentId: string, ctx: TenantCtx) {
    const payment = await this.moyasar.fetchPayment(paymentId);
    return this.activateFromPayment(payment, ctx);
  }

  async handleWebhookEvent(event: MoyasarWebhookEvent, ctx: TenantCtx) {
    const payment = await this.moyasar.fetchPayment(event.data.id);
    if (event.type === 'payment_paid') {
      return this.activateFromPayment(payment, ctx);
    }
    if (event.type === 'payment_failed') {
      const sub = await this.prisma.subscription.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      if (sub && (sub.status === 'trialing' || sub.status === 'active')) {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'past_due' } });
      }
      return { status: 'past_due' as const };
    }
    // payment_refunded / invoice_* — out of scope for V1; record nothing.
    return { status: 'ignored' as const };
  }

  private async activateFromPayment(payment: MoyasarPayment, ctx: TenantCtx) {
    if (payment.status !== 'paid') throw paymentFailed(payment.source.message ?? 'not paid');
    const cycle = payment.metadata.cycle === 'annual' ? 'annual' : 'monthly';
    const expected = cycle === 'annual' ? BUSINESS_PLAN.annualPriceMinor : BUSINESS_PLAN.priceMinor;
    if (payment.amount !== expected) throw new Error(`amount mismatch: got ${payment.amount}, expected ${expected}`);
    if (payment.currency !== 'SAR') throw new Error(`currency mismatch: ${payment.currency}`);
    if (payment.metadata.tenant_id !== ctx.tenantId) throw new Error(`tenant mismatch: ${payment.metadata.tenant_id}`);

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) throw new Error('no subscription');
      if (sub.status === 'active' && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()) {
        // Idempotent replay — invoice already issued.
        return { status: 'active' as const, subscriptionId: sub.id };
      }
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'active', plan: 'business', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
      });
      const invoiceNumber = await this.nextInvoiceNumber(tx, ctx.tenantId);
      const tenant = await tx.tenant.findFirst({ where: { id: ctx.tenantId }, select: { name: true } });
      await tx.invoice.create({
        data: {
          tenantId: ctx.tenantId,
          subscriptionId: sub.id,
          moyasarPaymentId: payment.id,
          number: invoiceNumber,
          totalMinor: payment.amount,
          sellerName: this.config.get<string>('SELLER_NAME') ?? 'أثر',
          buyerName: tenant?.name ?? 'Customer',
        },
      });
      return { status: 'active' as const, subscriptionId: updated.id };
    });
  }

  private async nextInvoiceNumber(tx: any, tenantId: string): Promise<string> {
    const prefix = this.config.get<string>('INVOICE_NUMBER_PREFIX') ?? 'INV';
    const last = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? Number(last.number.split('-').pop()) + 1 : 1;
    return `${prefix}-${tenantId.slice(-6)}-${String(seq).padStart(6, '0')}`;
  }

  async cancel(ctx: TenantCtx) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) throw new Error('no subscription');
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'canceled', cancelAtPeriodEnd: true },
    });
    return { status: updated.status, currentPeriodEnd: updated.currentPeriodEnd };
  }

  async getSubscription(ctx: TenantCtx) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const plan = resolvePlan(sub?.plan ?? 'trial');
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [drafts, images, searches] = await Promise.all([
      this.prisma.usageRecord.aggregate({ _sum: { units: true }, where: { tenantId: ctx.tenantId, kind: 'text', createdAt: { gte: startOfMonth } } }),
      this.prisma.usageRecord.aggregate({ _sum: { units: true }, where: { tenantId: ctx.tenantId, kind: 'image', createdAt: { gte: startOfMonth } } }),
      this.prisma.usageRecord.aggregate({ _sum: { units: true }, where: { tenantId: ctx.tenantId, kind: 'search', createdAt: { gte: startOfMonth } } }),
    ]);
    return {
      status: sub?.status ?? 'trialing',
      planCode: plan.code,
      priceSar: plan.priceSar,
      cycle: 'monthly' as const,
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      usage: {
        drafts: { used: drafts._sum.units ?? 0, cap: plan.monthlyDraftCap },
        images: { used: images._sum.units ?? 0, cap: plan.monthlyImageCap },
        searches: { used: searches._sum.units ?? 0, cap: plan.monthlySearchCap },
      },
    };
  }

  async getInvoice(ctx: TenantCtx, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: ctx.tenantId },
    });
    if (!inv) throw invoiceNotFound();
    return inv;
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- billing.service`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/billing/billing.service.ts src/billing/billing.service.spec.ts src/billing/dto/
git commit -m "feat(billing): BillingService — subscribe/verify/issue/cancel/get"
```

---

## Task 11: BillingController + Module + AppModule wiring

**Files:**
- Create: `src/billing/billing.controller.ts`
- Create: `src/billing/billing.controller.spec.ts`
- Create: `src/billing/billing.module.ts`
- Modify: `src/app.module.ts`
- Modify: `.env.example` (add MOYASAR_* + SELLER_NAME + INVOICE_NUMBER_PREFIX + BILLING_PUBLIC_URL)

- [ ] **Step 1: Controller**

`src/billing/billing.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';
import { BillingService } from './billing.service';
import { MoyasarClient } from './moyasar.client';
import { SubscribeDto } from './dto/subscribe.dto';
import { CancelDto } from './dto/cancel.dto';
import { verifyWebhookToken } from './webhook-signature';
import { webhookSignatureInvalid } from '../common/errors/error-envelope';
import { ConfigService } from '@nestjs/config';
import { MoyasarWebhookEvent } from './billing.types';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly moyasar: MoyasarClient,
    private readonly config: ConfigService,
  ) {}

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async subscribe(@CurrentTenant() ctx: TenantContext, @Body() dto: SubscribeDto) {
    return this.billing.createSubscriptionIntent(ctx, dto.planCode, dto.cycle);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    const body = req.body as MoyasarWebhookEvent;
    const expected = this.config.get<string>('MOYASAR_WEBHOOK_SECRET') ?? '';
    if (!verifyWebhookToken(body.secret_token, expected)) throw webhookSignatureInvalid();
    // Re-fetch verifies status; idempotent on payment.id (BillingService.activateFromPayment).
    const ctx = { tenantId: body.data.metadata.tenant_id, userId: 'webhook' };
    return this.billing.handleWebhookEvent(body, ctx);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async subscription(@CurrentTenant() ctx: TenantContext) {
    return this.billing.getSubscription(ctx);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async cancel(@CurrentTenant() ctx: TenantContext, @Body() dto: CancelDto) {
    return this.billing.cancel(ctx);
  }

  @Get('invoice/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async invoice(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.billing.getInvoice(ctx, id);
  }
}
```

- [ ] **Step 2: Controller spec**

`src/billing/billing.controller.spec.ts`:
```ts
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  function make(overrides: any = {}) {
    const billing = overrides.billing ?? {
      createSubscriptionIntent: jest.fn(async () => ({ paymentId: 'p', givenId: 'g', amount: 59900, currency: 'SAR', callbackUrl: 'cb', publishableKey: 'pk', metadata: {}, status: 'initiated', transactionUrl: null })),
      handleWebhookEvent: jest.fn(async () => ({ status: 'active' })),
      getSubscription: jest.fn(async () => ({ status: 'active' })),
      cancel: jest.fn(async () => ({ status: 'canceled' })),
      getInvoice: jest.fn(async () => ({ id: 'inv_1' })),
    };
    const moyasar = overrides.moyasar ?? { createPaymentIntent: jest.fn(), fetchPayment: jest.fn() };
    const config = { get: (k: string) => ({ MOYASAR_WEBHOOK_SECRET: 'whsec_xxx' })[k] } as any;
    const ctrl = new BillingController(billing, moyasar, config);
    return { ctrl, billing, config };
  }

  it('subscribe delegates to billing', async () => {
    const { ctrl, billing } = make();
    await ctrl.subscribe({ tenantId: 't1', userId: 'u1' } as any, { planCode: 'business', cycle: 'monthly' });
    expect(billing.createSubscriptionIntent).toHaveBeenCalled();
  });

  it('webhook with valid token delegates; invalid throws 401', async () => {
    const { ctrl, billing } = make();
    const okReq = { body: { secret_token: 'whsec_xxx', type: 'payment_paid', data: { id: 'pay_1', metadata: { tenant_id: 't1' } } } };
    await ctrl.webhook(okReq as any);
    expect(billing.handleWebhookEvent).toHaveBeenCalled();

    const { ctrl: ctrl2 } = make();
    const badReq = { body: { secret_token: 'wrong', type: 'payment_paid', data: { id: 'pay_1', metadata: { tenant_id: 't1' } } } };
    await expect(ctrl2.webhook(badReq as any)).rejects.toThrow();
  });

  it('subscription delegates to billing', async () => {
    const { ctrl, billing } = make();
    await ctrl.subscription({ tenantId: 't1', userId: 'u1' } as any);
    expect(billing.getSubscription).toHaveBeenCalled();
  });

  it('cancel delegates to billing', async () => {
    const { ctrl, billing } = make();
    await ctrl.cancel({ tenantId: 't1', userId: 'u1' } as any, { confirm: true });
    expect(billing.cancel).toHaveBeenCalled();
  });

  it('invoice delegates to billing', async () => {
    const { ctrl, billing } = make();
    await ctrl.invoice({ tenantId: 't1', userId: 'u1' } as any, 'inv_1');
    expect(billing.getInvoice).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u1' }, 'inv_1');
  });
});
```

- [ ] **Step 3: Module**

`src/billing/billing.module.ts`:
```ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EngineModule } from '../engine/engine.module';
import { TenantModule } from '../tenant/tenant.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MoyasarClient } from './moyasar.client';
import { TrialExpiryProcessor, TRIAL_EXPIRY_QUEUE } from './trial-expiry.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: TRIAL_EXPIRY_QUEUE }),
    EngineModule,
    TenantModule,
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: MoyasarClient,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) =>
        MoyasarClient.fromSecret(cfg.get<string>('MOYASAR_SECRET_KEY') ?? ''),
    },
    TrialExpiryProcessor,
  ],
  exports: [BillingService],
})
export class BillingModule {}
```

(Note: `ConfigService` import path is `@nestjs/config`. Adjust if double-providing `MoyasarClient`.)

- [ ] **Step 4: Wire AppModule**

In `src/app.module.ts`, add `BillingModule` to imports:

```ts
import { BillingModule } from './billing/billing.module';
// ...
imports: [
  // ... existing
  BillingModule,
],
```

- [ ] **Step 5: Add env vars to .env.example**

Append:
```
# Moyasar (Phase 6)
MOYASAR_PUBLISHABLE_KEY=pk_test_xxx
MOYASAR_SECRET_KEY=sk_test_xxx
MOYASAR_WEBHOOK_SECRET=replace-me
BILLING_PUBLIC_URL=https://app.example.com
SELLER_NAME=أثر
INVOICE_NUMBER_PREFIX=INV
```

- [ ] **Step 6: Run typecheck + tests**

Run: `npm run typecheck && npm test -- billing`
Expected: 0 errors; all billing tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/billing/billing.controller.ts src/billing/billing.controller.spec.ts src/billing/billing.module.ts src/app.module.ts .env.example
git commit -m "feat(billing): BillingController + Module + AppModule wiring"
```

---

## Task 12: E2E smoke

**Files:**
- Create: `test/billing.e2e-spec.ts`

- [ ] **Step 1: Write E2E spec**

`test/billing.e2e-spec.ts` (sketch — full file requires the existing e2e harness in `test/`):
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Billing e2e', () => {
  let app: INestApplication;
  let token: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Register a fresh tenant.
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `b+${Date.now()}@x.com`, password: 'Pass1234!', tenantName: 'BillingTest', name: 'T' })
      .expect(201);
    token = reg.body.accessToken;
    tenantId = reg.body.tenantId;
  });

  afterAll(async () => { await app.close(); });

  it('GET /billing/subscription returns trialing + caps', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe('trialing');
    expect(res.body.usage.drafts.cap).toBe(10);
  });

  it('POST /billing/webhook with bad signature is 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/billing/webhook')
      .send({ secret_token: 'wrong', type: 'payment_paid', data: { id: 'x' } })
      .expect(401);
  });
});
```

(This E2E is gated on `DATABASE_URL` and the live Postgres+Redis stack. It is run in CI — local runs are best-effort.)

- [ ] **Step 2: Run E2E locally if possible**

Run: `npm run test:e2e -- billing`
Expected: passes if stack is up; skipped locally if not (CI verifies).

- [ ] **Step 3: Commit**

```bash
git add test/billing.e2e-spec.ts
git commit -m "test(billing): e2e smoke (subscription + webhook signature)"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run all checks**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: 0 typecheck errors, 0 lint errors (warnings allowed per Phase 5 baseline — 274 pre-existing `any` warnings), all tests pass.

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e
```

Expected: existing e2e pass + new billing e2e pass.

- [ ] **Step 3: Verify diff**

```bash
git status
git diff --stat
```

Expected: only the files listed in this plan are touched.

- [ ] **Step 4: Hand off**

Plan complete. Hand off for owner-review per saas-phase-runner (Phase 6 touches `prisma/schema.prisma` and `prisma/migrations/*` — owner gate required before merge).