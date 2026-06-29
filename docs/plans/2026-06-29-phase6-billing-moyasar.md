# Phase 6 — Billing (Moyasar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the billing subsystem for أثر — Moyasar-backed subscription (single launch plan + 7-day trial), webhook-driven activation with server-side re-fetch, simple subscription invoicing, and a `UsageGuard.canConsume` seam consumed by the engine to enforce per-plan monthly caps.

**Architecture:** A NestJS `BillingModule` exposes `/billing` routes (all under the foundation's `api/v1` prefix). `BillingService` orchestrates the Moyasar flow: it creates a payment intent (publishable-key config returned to the frontend), and activates a subscription ONLY after a server-side `GET /v1/payments/:id` re-fetch with the secret key matches status/amount/currency/metadata.tenant_id. Activation is triggered by the webhook (the reliable channel) and is idempotent on `payment.id`. A new `Invoice` table (the only new table this phase) stores simple subscription invoices with sequential per-tenant numbers. `UsageGuard.canConsume(tenantId, kind)` reads `UsageRecord` sums against the current plan's caps and is consumed by the Phase-1 engine before every generation.

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, Jest. Moyasar REST API (`api.moyasar.com/v1`, HTTP Basic Auth with `sk_`). `uuid` for `given_id` (uuidv5). Node `crypto.timingSafeEqual` for webhook secret comparison.

## Global Constraints

- Multi-tenant logical: every billing/usage/invoice row carries `tenantId`; an invoice of another tenant → `404`. (spec §المبادئ, §AC)
- Code, identifiers, comments, commit messages: **English only**. Arabic only in user-facing strings (e.g. `canConsume` reason, invoice `sellerName`/Arabic labels). (shared conventions)
- Route prefix `api/v1` is already set in foundation `src/main.ts` (`app.setGlobalPrefix('api/v1')`). Do NOT re-add it.
- All `/billing` routes are guarded by `JwtAuthGuard, TenantGuard` and read `@CurrentTenant() ctx: TenantContext` (`{ userId, tenantId }`) from Phase 3 — EXCEPT `POST /billing/webhook`, which is public and verified by the shared `secret_token` (`timingSafeEqual`) + server-side re-fetch.
- Golden payment rule: Moyasar is the source of truth, the browser is presumed-hostile. Activate ONLY after a server re-fetch matches `status === 'paid'`, `amount`, `currency === 'SAR'`, and `metadata.tenant_id`. Fulfill on the webhook (idempotent on `payment.id`), confirm on the redirect. (spec §المبادئ, moyasar skill golden rules 4 & 7)
- Amounts are always integer minor units (halalas): `59900` = 599.00 SAR. Never floats, never `* 100` twice. Minimum `100`. (spec §المبادئ, moyasar golden rule 3)
- `pk_` lives in the browser only; `sk_` never leaves the server. Card data never touches our server (Moyasar.js / Apple Pay). (spec §المبادئ, moyasar golden rules 1 & 2)
- `given_id` (uuidv5, deterministic per `sub:{tenantId}:{attempt}`) on every `POST /payments`. A `400 already created` is treated as "payment exists, fetch it", not a failure. (spec §المبادئ, §error-table, moyasar §7)
- This phase is CONSUMED by Phase 1 (engine) via `UsageGuard.canConsume` before every text/image/search generation. `past_due`/`canceled` → `allowed=false` regardless of counter. All three `UsageKind` (`text`|`image`|`search`) are capped (search included — NFR-7).
- The "current" subscription for a tenant is the most-recent `Subscription` row (history is one-to-many; `past_due ↔ active` cycles may accumulate rows). (spec §الاعتمادات)
- DO NOT extend the `Subscription` model — `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEndsAt`, and the `SubscriptionStatus` enum already exist in the foundation schema. The ONLY new table is `Invoice` (new migration — LR-004: never edit existing migrations). (shared conventions, spec §الاعتمادات)
- Secrets in a secrets manager, not git: `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_WEBHOOK_SECRET`. (shared conventions)
- TDD: failing test first, minimal impl, commit per task. Jest config is in foundation `package.json`.

## File Structure

```
prisma/schema.prisma                                   # MODIFY: add Invoice model + InvoiceStatus enum + back-relations
prisma/migrations/<ts>_add_invoice/                    # NEW migration (Invoice table only)
.env.example                                           # MODIFY: add Moyasar env vars

src/billing/billing.types.ts                           # MoyasarWebhookEvent, MoyasarPayment, ConsumeDecision, UsageKind, etc.
src/billing/plan-definitions.ts                        # PlanDefinition, BUSINESS_PLAN, TRIAL_PLAN, resolvePlan(), getCap()
src/billing/plan-definitions.spec.ts

src/billing/moyasar.client.ts                          # MoyasarClient.fetchPayment(id) — server-side re-fetch with sk_
src/billing/moyasar.client.spec.ts

src/billing/usage.guard.ts                             # UsageGuard.canConsume(tenantId, kind)
src/billing/usage.guard.spec.ts

src/billing/billing.service.ts                         # createPaymentIntent, verifyAndActivate, issueInvoice, transitionStatus
src/billing/billing.service.spec.ts

src/billing/dto/subscribe.dto.ts                       # SubscribeDto (planCode, cycle)
src/billing/webhook-guard.ts                           # verifyWebhookSecret(token) — timingSafeEqual
src/billing/webhook-guard.spec.ts

src/billing/billing.controller.ts                      # POST /subscribe, /webhook, GET /subscription, POST /cancel, GET /invoice/:id
src/billing/billing.controller.spec.ts

src/billing/billing.module.ts                          # wires controller + providers
src/app.module.ts                                      # MODIFY: import BillingModule
```

**Decomposition rationale:** pure logic (plan config, webhook-secret compare) is isolated into small, independently-testable units with no I/O. `MoyasarClient` isolates the only external HTTP call (the secret-key re-fetch) so it can be mocked everywhere else. `BillingService` holds the DB/orchestration logic and depends on the small units. `UsageGuard` is its own unit because the engine imports it directly. The controller is a thin HTTP layer over the service + guards.

---

### Task 1: Invoice Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add `InvoiceStatus` enum, `Invoice` model, back-relations on `Tenant` and `Subscription`)
- Create: `prisma/migrations/<timestamp>_add_invoice/migration.sql` (generated by `prisma migrate dev`)

**Interfaces:**
- Consumes: existing `Tenant`, `Subscription` models from foundation (Task 3 of foundation plan).
- Produces: Prisma `Invoice` model — fields `id, tenantId, subscriptionId, moyasarPaymentId (unique), number, issuedAt, totalMinor, currency, sellerName, buyerName, status`; enum `InvoiceStatus { issued refunded }`; relations `Tenant.invoices Invoice[]`, `Subscription.invoices Invoice[]`.

- [ ] **Step 1: Add the `InvoiceStatus` enum**

In `prisma/schema.prisma`, directly after the existing `enum SubscriptionStatus { trialing active past_due canceled }` line, add:

```prisma
enum InvoiceStatus { issued refunded }
```

- [ ] **Step 2: Add back-relations on existing models (no field changes to Subscription's billing columns)**

In the `Tenant` model, add to its relation block (alongside `usageRecords  UsageRecord[]`):

```prisma
  invoices      Invoice[]
```

In the `Subscription` model, add to its relation block (alongside `usageRecords UsageRecord[]`):

```prisma
  invoices     Invoice[]
```

Note: these add ONLY relation fields (no DB columns on `Subscription`/`Tenant` change). Do not touch `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEndsAt`, or any scalar.

- [ ] **Step 3: Add the `Invoice` model**

Replace the foundation's placeholder comment line `//   SaudiOccasion (Phase 4), Reminder (Phase 5), Invoice (Phase 6).` region by appending the model below at the end of the schema (keep the comment; the model is the real thing):

```prisma
model Invoice {
  id               String        @id @default(cuid())
  tenantId         String
  subscriptionId   String
  moyasarPaymentId String        @unique          // links to the Moyasar payment; idempotency anchor
  number           String                          // sequential per tenant, no gaps (e.g. "ATHAR-000001")
  issuedAt         DateTime      @default(now())
  // amount — integer minor units (halalas)
  totalMinor       Int
  currency         String        @default("SAR")
  sellerName       String
  buyerName        String
  status           InvoiceStatus @default(issued)
  tenant       Tenant       @relation(fields: [tenantId], references: [id])
  subscription Subscription @relation(fields: [subscriptionId], references: [id])
  @@unique([tenantId, number])                     // per-tenant sequential numbering, enforced unique
  @@index([tenantId])
  @@index([subscriptionId])
}
```

- [ ] **Step 4: Create the migration and regenerate the client**

Run: `npx prisma migrate dev --name add_invoice`
Expected: a NEW migration folder `prisma/migrations/<timestamp>_add_invoice/` is created and applied; `Invoice` table + `InvoiceStatus` enum exist; Prisma client regenerated; no edits to any pre-existing migration (LR-004).

- [ ] **Step 5: Verify the model is queryable + typecheck**

Run: `npx prisma generate && npm run typecheck`
Expected: no errors; `PrismaClient` now exposes `prisma.invoice`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(billing): add Invoice model and migration"
```

---

### Task 2: Billing types

**Files:**
- Create: `src/billing/billing.types.ts`
- Test: `src/billing/billing.types.spec.ts`

**Interfaces:**
- Produces: `UsageKind` (`'text' | 'image' | 'search'`), `SubscriptionStatusLiteral`, `ConsumeDecision`, `MoyasarEventType`, `MoyasarPaymentStatus`, `MoyasarPayment`, `MoyasarWebhookEvent`, `InvoiceView`. Consumed by every later billing task.

- [ ] **Step 1: Write the failing test (type contract guard)**

`src/billing/billing.types.spec.ts`:
```ts
import type {
  ConsumeDecision,
  MoyasarPayment,
  MoyasarWebhookEvent,
  UsageKind,
} from './billing.types';

describe('billing.types', () => {
  it('a ConsumeDecision literal satisfies the interface', () => {
    const d: ConsumeDecision = { allowed: false, used: 10, cap: 10, reason: 'بلغت السقف' };
    expect(d.allowed).toBe(false);
  });

  it('a MoyasarPayment literal satisfies the interface', () => {
    const p: MoyasarPayment = {
      id: 'payment_x',
      status: 'paid',
      amount: 59900,
      currency: 'SAR',
      source: { type: 'creditcard', company: 'mada' },
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
    };
    expect(p.amount).toBe(59900);
  });

  it('a MoyasarWebhookEvent wraps a payment', () => {
    const kinds: UsageKind[] = ['text', 'image', 'search'];
    const e: MoyasarWebhookEvent = {
      id: 'evt_1',
      type: 'payment_paid',
      created_at: '2026-06-29T00:00:00Z',
      secret_token: 's',
      data: {
        id: 'payment_x',
        status: 'paid',
        amount: 59900,
        currency: 'SAR',
        source: { type: 'creditcard' },
        metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      },
    };
    expect(e.type).toBe('payment_paid');
    expect(kinds).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- billing.types`
Expected: FAIL — cannot find module `./billing.types`.

- [ ] **Step 3: Implement `src/billing/billing.types.ts`**

```ts
// Code-facing types for the billing subsystem. Mirrors the Moyasar webhook/payment
// payload (simplified) plus internal decision/view shapes. Arabic appears only in
// user-facing string VALUES at call sites, never in identifiers here.

export type UsageKind = 'text' | 'image' | 'search';

export type SubscriptionStatusLiteral = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface ConsumeDecision {
  allowed: boolean;
  used: number;
  cap: number;
  reason?: string; // Arabic message on denial, e.g. "بلغت سقف الباقة الشهري للمسودّات"
}

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
  transaction_url?: string; // 3DS challenge destination when status === 'initiated'
  message?: string;
}

export interface MoyasarPaymentMetadata {
  tenant_id: string;
  plan_code: string;
  cycle: string;
}

export interface MoyasarPayment {
  id: string; // 'payment_…' — idempotency key
  status: MoyasarPaymentStatus;
  amount: number; // halalas — compared === expected priceMinor
  currency: 'SAR';
  source: MoyasarPaymentSource;
  metadata: MoyasarPaymentMetadata;
}

export interface MoyasarWebhookEvent {
  id: string; // 'evt_…'
  type: MoyasarEventType;
  created_at: string;
  secret_token: string; // shared secret — compared constant-time
  data: MoyasarPayment; // full payment object (not trusted without re-fetch)
}

export interface UsageView {
  used: number;
  cap: number;
}

export interface InvoiceView {
  id: string;
  tenantId: string;
  subscriptionId: string;
  moyasarPaymentId: string;
  number: string;
  issuedAt: string;
  totalMinor: number;
  currency: string;
  sellerName: string;
  buyerName: string;
  status: 'issued' | 'refunded';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- billing.types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/billing.types.ts src/billing/billing.types.spec.ts
git commit -m "feat(billing): add billing types"
```

---

### Task 3: Plan definitions (BUSINESS_PLAN + TRIAL_PLAN + helpers)

**Files:**
- Create: `src/billing/plan-definitions.ts`
- Test: `src/billing/plan-definitions.spec.ts`

**Interfaces:**
- Consumes: `UsageKind` from `billing.types`.
- Produces:
  - `interface PlanDefinition { code; nameAr; priceSar; priceMinor; annualPriceMinor; billingCycle; trialDays; monthlyDraftCap; monthlyImageCap; monthlySearchCap }`
  - `const BUSINESS_PLAN: PlanDefinition`, `const TRIAL_PLAN: PlanDefinition`
  - `resolvePlan(code: string): PlanDefinition` (throws on unknown)
  - `priceForCycle(plan: PlanDefinition, cycle: 'monthly' | 'annual'): number`
  - `getCap(plan: PlanDefinition, kind: UsageKind): number`

- [ ] **Step 1: Write the failing test**

`src/billing/plan-definitions.spec.ts`:
```ts
import {
  BUSINESS_PLAN,
  TRIAL_PLAN,
  resolvePlan,
  priceForCycle,
  getCap,
} from './plan-definitions';

describe('plan-definitions', () => {
  it('business plan is 599 SAR = 59900 halalas, 7-day trial', () => {
    expect(BUSINESS_PLAN.code).toBe('business');
    expect(BUSINESS_PLAN.priceSar).toBe(599);
    expect(BUSINESS_PLAN.priceMinor).toBe(59900);
    expect(BUSINESS_PLAN.trialDays).toBe(7);
  });

  it('trial plan is free with smaller caps', () => {
    expect(TRIAL_PLAN.code).toBe('trial');
    expect(TRIAL_PLAN.priceMinor).toBe(0);
    expect(TRIAL_PLAN.monthlyDraftCap).toBe(10);
    expect(TRIAL_PLAN.monthlyImageCap).toBe(5);
    expect(TRIAL_PLAN.monthlySearchCap).toBe(10);
  });

  it('resolvePlan returns the matching plan and throws on unknown', () => {
    expect(resolvePlan('business')).toBe(BUSINESS_PLAN);
    expect(resolvePlan('trial')).toBe(TRIAL_PLAN);
    expect(() => resolvePlan('enterprise')).toThrow('Unknown plan code: enterprise');
  });

  it('priceForCycle selects monthly vs annual minor amount', () => {
    expect(priceForCycle(BUSINESS_PLAN, 'monthly')).toBe(59900);
    expect(priceForCycle(BUSINESS_PLAN, 'annual')).toBe(BUSINESS_PLAN.annualPriceMinor);
  });

  it('getCap maps each UsageKind to its cap', () => {
    expect(getCap(BUSINESS_PLAN, 'text')).toBe(BUSINESS_PLAN.monthlyDraftCap);
    expect(getCap(BUSINESS_PLAN, 'image')).toBe(BUSINESS_PLAN.monthlyImageCap);
    expect(getCap(BUSINESS_PLAN, 'search')).toBe(BUSINESS_PLAN.monthlySearchCap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- plan-definitions`
Expected: FAIL — cannot find module `./plan-definitions`.

- [ ] **Step 3: Implement `src/billing/plan-definitions.ts`**

```ts
import type { UsageKind } from './billing.types';

// Plan config — the single source of truth for prices and caps. Not scattered in code.
export interface PlanDefinition {
  code: string; // 'business' (single launch plan) | 'trial'
  nameAr: string; // user-facing Arabic display name
  priceSar: number; // SAR for display
  priceMinor: number; // halalas — source for the API/payment (monthly)
  annualPriceMinor: number; // discounted annual price (halalas)
  billingCycle: 'monthly' | 'annual';
  trialDays: number;
  monthlyDraftCap: number; // cap for UsageKind 'text'
  monthlyImageCap: number; // cap for UsageKind 'image'
  monthlySearchCap: number; // cap for UsageKind 'search' (NFR-7 — search is an expensive call)
}

export const BUSINESS_PLAN: PlanDefinition = {
  code: 'business',
  nameAr: 'أعمال',
  priceSar: 599,
  priceMinor: 59900,
  annualPriceMinor: 599000, // 10 months' price for an annual commitment (discount)
  billingCycle: 'monthly',
  trialDays: 7,
  monthlyDraftCap: 120,
  monthlyImageCap: 60,
  monthlySearchCap: 200,
};

// Free trial caps — a separate PlanDefinition with code='trial', smaller than the paid plan.
// The engine reads the SAME canConsume(...) whether the tenant is trialing or active;
// the cap source is the PlanDefinition matching the current subscription plan.
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

const PLANS: Record<string, PlanDefinition> = {
  [BUSINESS_PLAN.code]: BUSINESS_PLAN,
  [TRIAL_PLAN.code]: TRIAL_PLAN,
};

export function resolvePlan(code: string): PlanDefinition {
  const plan = PLANS[code];
  if (!plan) {
    throw new Error(`Unknown plan code: ${code}`);
  }
  return plan;
}

export function priceForCycle(plan: PlanDefinition, cycle: 'monthly' | 'annual'): number {
  return cycle === 'annual' ? plan.annualPriceMinor : plan.priceMinor;
}

export function getCap(plan: PlanDefinition, kind: UsageKind): number {
  switch (kind) {
    case 'text':
      return plan.monthlyDraftCap;
    case 'image':
      return plan.monthlyImageCap;
    case 'search':
      return plan.monthlySearchCap;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- plan-definitions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/plan-definitions.ts src/billing/plan-definitions.spec.ts
git commit -m "feat(billing): add plan definitions and trial plan"
```

---

### Task 4: Webhook secret guard (constant-time compare)

**Files:**
- Create: `src/billing/webhook-guard.ts`
- Test: `src/billing/webhook-guard.spec.ts`

**Interfaces:**
- Produces: `verifyWebhookSecret(received: string | undefined, expected: string): boolean` — uses `crypto.timingSafeEqual`; returns `false` (never throws) on length mismatch or missing token.

- [ ] **Step 1: Write the failing test**

`src/billing/webhook-guard.spec.ts`:
```ts
import { verifyWebhookSecret } from './webhook-guard';

describe('verifyWebhookSecret', () => {
  it('returns true for an exact match', () => {
    expect(verifyWebhookSecret('s3cr3t-token', 's3cr3t-token')).toBe(true);
  });

  it('returns false for a mismatch of equal length', () => {
    expect(verifyWebhookSecret('s3cr3t-tokeX', 's3cr3t-token')).toBe(false);
  });

  it('returns false for different lengths (no throw)', () => {
    expect(verifyWebhookSecret('short', 's3cr3t-token')).toBe(false);
  });

  it('returns false for undefined/empty received token', () => {
    expect(verifyWebhookSecret(undefined, 's3cr3t-token')).toBe(false);
    expect(verifyWebhookSecret('', 's3cr3t-token')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- webhook-guard`
Expected: FAIL — cannot find module `./webhook-guard`.

- [ ] **Step 3: Implement `src/billing/webhook-guard.ts`**

```ts
import { timingSafeEqual } from 'crypto';

// Constant-time comparison of the webhook shared secret. timingSafeEqual throws when
// the two buffers differ in length, so we guard length first and bail to false — a
// length mismatch is, by definition, a mismatch. Never throws.
export function verifyWebhookSecret(received: string | undefined, expected: string): boolean {
  if (!received) {
    return false;
  }
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- webhook-guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/webhook-guard.ts src/billing/webhook-guard.spec.ts
git commit -m "feat(billing): add constant-time webhook secret guard"
```

---

### Task 5: Moyasar client (server-side payment re-fetch)

**Files:**
- Create: `src/billing/moyasar.client.ts`
- Test: `src/billing/moyasar.client.spec.ts`

**Interfaces:**
- Consumes: `MoyasarPayment` from `billing.types`; `MOYASAR_SECRET_KEY` env var.
- Produces: injectable `MoyasarClient` with `fetchPayment(id: string): Promise<MoyasarPayment>` — `GET https://api.moyasar.com/v1/payments/:id` with HTTP Basic Auth (`sk_` as username, empty password). Throws `Error('Moyasar fetch failed: <status>')` on non-2xx.

- [ ] **Step 1: Write the failing test**

`src/billing/moyasar.client.spec.ts`:
```ts
import { MoyasarClient } from './moyasar.client';

describe('MoyasarClient', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('GETs the payment with Basic auth (sk_ as username, empty password)', async () => {
    const payment = {
      id: 'payment_x',
      status: 'paid',
      amount: 59900,
      currency: 'SAR',
      source: { type: 'creditcard' },
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payment,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new MoyasarClient('sk_test_abc');
    const result = await client.fetchPayment('payment_x');

    expect(result).toEqual(payment);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.moyasar.com/v1/payments/payment_x');
    const expectedAuth = 'Basic ' + Buffer.from('sk_test_abc:').toString('base64');
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
  });

  it('throws on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const client = new MoyasarClient('sk_test_abc');
    await expect(client.fetchPayment('missing')).rejects.toThrow('Moyasar fetch failed: 404');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- moyasar.client`
Expected: FAIL — cannot find module `./moyasar.client`.

- [ ] **Step 3: Implement `src/billing/moyasar.client.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { MoyasarPayment } from './billing.types';

export const MOYASAR_API_BASE = 'https://api.moyasar.com/v1';

// Server-only Moyasar client. Holds the SECRET key and is the single place we re-fetch
// a payment to confirm its real state (golden rule: never trust the browser/webhook body).
@Injectable()
export class MoyasarClient {
  constructor(private readonly secretKey: string) {}

  private authHeader(): string {
    // HTTP Basic Auth: secret key as username, empty password. Trailing colon required.
    return 'Basic ' + Buffer.from(`${this.secretKey}:`).toString('base64');
  }

  async fetchPayment(id: string): Promise<MoyasarPayment> {
    const res = await fetch(`${MOYASAR_API_BASE}/payments/${id}`, {
      method: 'GET',
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) {
      throw new Error(`Moyasar fetch failed: ${res.status}`);
    }
    return (await res.json()) as MoyasarPayment;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- moyasar.client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/moyasar.client.ts src/billing/moyasar.client.spec.ts
git commit -m "feat(billing): add Moyasar server-side payment re-fetch client"
```

---

### Task 6: UsageGuard.canConsume (cap + status enforcement)

**Files:**
- Create: `src/billing/usage.guard.ts`
- Test: `src/billing/usage.guard.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (foundation Task 4); `ConsumeDecision`, `UsageKind` from `billing.types`; `resolvePlan`, `getCap` from `plan-definitions`.
- Produces: injectable `UsageGuard` with `canConsume(tenantId: string, kind: UsageKind): Promise<ConsumeDecision>`. Consumed by the Phase-1 engine before every generation. Also exports `monthWindowStart(now?: Date): Date` (UTC first-of-month) helper.

- [ ] **Step 1: Write the failing test**

`src/billing/usage.guard.spec.ts`:
```ts
import { UsageGuard, monthWindowStart } from './usage.guard';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma(opts: {
  subscription: { status: string; plan: string } | null;
  used: number;
}): PrismaService {
  return {
    subscription: {
      findFirst: jest.fn().mockResolvedValue(opts.subscription),
    },
    usageRecord: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { units: opts.used } }),
    },
  } as unknown as PrismaService;
}

describe('monthWindowStart', () => {
  it('returns the UTC first-of-month at 00:00:00', () => {
    const start = monthWindowStart(new Date('2026-06-29T15:30:00Z'));
    expect(start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('UsageGuard.canConsume', () => {
  it('allows when under the cap (active business plan, text)', async () => {
    const prisma = makePrisma({ subscription: { status: 'active', plan: 'business' }, used: 5 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'text');
    expect(d).toEqual({ allowed: true, used: 5, cap: 120 });
  });

  it('denies with Arabic reason when the cap is reached (text)', async () => {
    const prisma = makePrisma({ subscription: { status: 'active', plan: 'business' }, used: 120 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'text');
    expect(d.allowed).toBe(false);
    expect(d.used).toBe(120);
    expect(d.cap).toBe(120);
    expect(d.reason).toBe('بلغت سقف الباقة الشهري للمسودّات');
  });

  it('caps search too (NFR-7) with a search-specific reason', async () => {
    const prisma = makePrisma({ subscription: { status: 'active', plan: 'business' }, used: 200 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'search');
    expect(d.allowed).toBe(false);
    expect(d.cap).toBe(200);
    expect(d.reason).toBe('بلغت سقف الباقة الشهري لعمليات البحث');
  });

  it('denies regardless of counter when subscription is past_due', async () => {
    const prisma = makePrisma({ subscription: { status: 'past_due', plan: 'business' }, used: 0 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'image');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('اشتراكك غير فعّال — يرجى تحديث الدفع لمتابعة التوليد');
  });

  it('denies when subscription is canceled', async () => {
    const prisma = makePrisma({ subscription: { status: 'canceled', plan: 'business' }, used: 0 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'text');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('اشتراكك غير فعّال — يرجى تحديث الدفع لمتابعة التوليد');
  });

  it('uses trial caps when the subscription plan is trial', async () => {
    const prisma = makePrisma({ subscription: { status: 'trialing', plan: 'trial' }, used: 10 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'text');
    expect(d).toEqual({
      allowed: false,
      used: 10,
      cap: 10,
      reason: 'بلغت سقف الباقة الشهري للمسودّات',
    });
  });

  it('denies when there is no subscription at all', async () => {
    const prisma = makePrisma({ subscription: null, used: 0 });
    const guard = new UsageGuard(prisma);
    const d = await guard.canConsume('t1', 'text');
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('لا يوجد اشتراك فعّال');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- usage.guard`
Expected: FAIL — cannot find module `./usage.guard`.

- [ ] **Step 3: Implement `src/billing/usage.guard.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ConsumeDecision, UsageKind } from './billing.types';
import { resolvePlan, getCap } from './plan-definitions';

// Arabic denial reasons (user-facing strings — the only Arabic allowed in code).
const CAP_REASON: Record<UsageKind, string> = {
  text: 'بلغت سقف الباقة الشهري للمسودّات',
  image: 'بلغت سقف الباقة الشهري للصور',
  search: 'بلغت سقف الباقة الشهري لعمليات البحث',
};
const INACTIVE_REASON = 'اشتراكك غير فعّال — يرجى تحديث الدفع لمتابعة التوليد';
const NO_SUBSCRIPTION_REASON = 'لا يوجد اشتراك فعّال';

// First moment of the current month, UTC — the monthly usage window boundary.
export function monthWindowStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

@Injectable()
export class UsageGuard {
  constructor(private readonly prisma: PrismaService) {}

  // Read by the Phase-1 engine before EVERY text/image/search generation.
  async canConsume(tenantId: string, kind: UsageKind): Promise<ConsumeDecision> {
    // "Current" subscription = most recent row for the tenant (history is one-to-many).
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return { allowed: false, used: 0, cap: 0, reason: NO_SUBSCRIPTION_REASON };
    }

    const plan = resolvePlan(subscription.plan);
    const cap = getCap(plan, kind);

    // past_due / canceled → no access regardless of the counter.
    if (subscription.status === 'past_due' || subscription.status === 'canceled') {
      return { allowed: false, used: 0, cap, reason: INACTIVE_REASON };
    }

    const agg = await this.prisma.usageRecord.aggregate({
      _sum: { units: true },
      where: { tenantId, kind, createdAt: { gte: monthWindowStart() } },
    });
    const used = agg._sum.units ?? 0;

    if (used >= cap) {
      return { allowed: false, used, cap, reason: CAP_REASON[kind] };
    }
    return { allowed: true, used, cap };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- usage.guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/usage.guard.ts src/billing/usage.guard.spec.ts
git commit -m "feat(billing): add UsageGuard.canConsume with cap and status enforcement"
```

---

### Task 7: SubscribeDto

**Files:**
- Create: `src/billing/dto/subscribe.dto.ts`
- Test: `src/billing/dto/subscribe.dto.spec.ts`

**Interfaces:**
- Produces: `class SubscribeDto { planCode: string; cycle: 'monthly' | 'annual' }` with `class-validator` decorators (`@IsIn(['business'])`, `@IsIn(['monthly','annual'])`).
- Consumes: `class-validator`, `class-transformer` (install if not present from foundation).

- [ ] **Step 1: Ensure validation deps are installed**

Run: `npm i class-validator class-transformer`
Expected: both present in `package.json` dependencies (no-op if foundation already added them).

- [ ] **Step 2: Write the failing test**

`src/billing/dto/subscribe.dto.spec.ts`:
```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubscribeDto } from './subscribe.dto';

async function errorsFor(payload: unknown) {
  const dto = plainToInstance(SubscribeDto, payload);
  return validate(dto);
}

describe('SubscribeDto', () => {
  it('accepts business + monthly', async () => {
    expect(await errorsFor({ planCode: 'business', cycle: 'monthly' })).toHaveLength(0);
  });

  it('accepts business + annual', async () => {
    expect(await errorsFor({ planCode: 'business', cycle: 'annual' })).toHaveLength(0);
  });

  it('rejects an unknown plan code', async () => {
    expect((await errorsFor({ planCode: 'enterprise', cycle: 'monthly' })).length).toBeGreaterThan(0);
  });

  it('rejects an invalid cycle', async () => {
    expect((await errorsFor({ planCode: 'business', cycle: 'weekly' })).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- subscribe.dto`
Expected: FAIL — cannot find module `./subscribe.dto`.

- [ ] **Step 4: Implement `src/billing/dto/subscribe.dto.ts`**

```ts
import { IsIn } from 'class-validator';

export class SubscribeDto {
  // Single launch plan at go-live; @IsIn keeps the surface explicit.
  @IsIn(['business'])
  planCode!: string;

  @IsIn(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- subscribe.dto`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/billing/dto/subscribe.dto.ts src/billing/dto/subscribe.dto.spec.ts package.json package-lock.json
git commit -m "feat(billing): add SubscribeDto with validation"
```

---

### Task 8: BillingService — createPaymentIntent

**Files:**
- Create: `src/billing/billing.service.ts`
- Test: `src/billing/billing.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `MoyasarClient`; `resolvePlan`, `priceForCycle` from `plan-definitions`; env `MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_SECRET_KEY`; `ConfigService`.
- Produces: injectable `BillingService`. This task adds:
  - `createPaymentIntent(tenantId: string, planCode: string, cycle: 'monthly' | 'annual'): Promise<PaymentIntentResponse>`
  - `interface PaymentIntentResponse { publishableKey; amount; currency: 'SAR'; callbackUrl; givenId; metadata: { tenant_id; plan_code; cycle } }`
  - `buildGivenId(tenantId: string, attempt: number): string` (uuidv5, namespace constant).

The service is built incrementally across Tasks 8–11; each task adds methods and tests without rewriting prior ones.

- [ ] **Step 1: Install uuid**

Run: `npm i uuid && npm i -D @types/uuid`
Expected: `uuid` in dependencies.

- [ ] **Step 2: Write the failing test**

`src/billing/billing.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { MoyasarClient } from './moyasar.client';
import { PrismaService } from '../prisma/prisma.service';

const ENV: Record<string, string> = {
  MOYASAR_PUBLISHABLE_KEY: 'pk_test_pub',
  MOYASAR_SECRET_KEY: 'sk_test_sec',
  MOYASAR_WEBHOOK_SECRET: 'whsec',
  BILLING_CALLBACK_URL: 'https://app.athar.sa/billing/callback',
  ATHAR_SELLER_NAME: 'Athar',
};

function buildService(prisma: Partial<PrismaService>, moyasar: Partial<MoyasarClient>) {
  return Test.createTestingModule({
    providers: [
      BillingService,
      { provide: PrismaService, useValue: prisma },
      { provide: MoyasarClient, useValue: moyasar },
      { provide: ConfigService, useValue: { get: (k: string) => ENV[k] } },
    ],
  }).compile();
}

describe('BillingService.createPaymentIntent', () => {
  it('returns Moyasar.js config with amount in halalas and tenant metadata', async () => {
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 's1', tenantId: 't1' }) },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    const intent = await svc.createPaymentIntent('t1', 'business', 'monthly');

    expect(intent.publishableKey).toBe('pk_test_pub');
    expect(intent.amount).toBe(59900);
    expect(intent.currency).toBe('SAR');
    expect(intent.callbackUrl).toBe('https://app.athar.sa/billing/callback');
    expect(intent.metadata).toEqual({ tenant_id: 't1', plan_code: 'business', cycle: 'monthly' });
    expect(typeof intent.givenId).toBe('string');
    expect(intent.givenId.length).toBeGreaterThan(0);
  });

  it('uses the annual price for cycle=annual', async () => {
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue({ id: 's1', tenantId: 't1' }) },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    const intent = await svc.createPaymentIntent('t1', 'business', 'annual');
    expect(intent.amount).toBe(599000);
  });

  it('buildGivenId is deterministic per tenant+attempt and differs across attempts', () => {
    const prisma = {} as unknown as PrismaService;
    return buildService(prisma, {}).then((m) => {
      const svc = m.get(BillingService);
      const a1 = svc.buildGivenId('t1', 1);
      const a1again = svc.buildGivenId('t1', 1);
      const a2 = svc.buildGivenId('t1', 2);
      expect(a1).toBe(a1again);
      expect(a1).not.toBe(a2);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- billing.service`
Expected: FAIL — cannot find module `./billing.service`.

- [ ] **Step 4: Implement `src/billing/billing.service.ts` (createPaymentIntent only)**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v5 as uuidv5 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { MoyasarClient } from './moyasar.client';
import { resolvePlan, priceForCycle } from './plan-definitions';

// Fixed namespace UUID so given_id is deterministic per (tenant, attempt).
const GIVEN_ID_NAMESPACE = 'b6c0e4f2-5a1d-4c3e-9f7b-2d8a1e6c0f44';

export interface PaymentIntentResponse {
  publishableKey: string;
  amount: number; // halalas
  currency: 'SAR';
  callbackUrl: string;
  givenId: string;
  metadata: { tenant_id: string; plan_code: string; cycle: string };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moyasar: MoyasarClient,
    private readonly config: ConfigService,
  ) {}

  buildGivenId(tenantId: string, attempt: number): string {
    return uuidv5(`sub:${tenantId}:${attempt}`, GIVEN_ID_NAMESPACE);
  }

  async createPaymentIntent(
    tenantId: string,
    planCode: string,
    cycle: 'monthly' | 'annual',
  ): Promise<PaymentIntentResponse> {
    const plan = resolvePlan(planCode);
    const amount = priceForCycle(plan, cycle);

    // Attempt count drives a fresh given_id per retry; one current subscription per tenant.
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const attempt = subscription ? 1 : 1; // first paid attempt; bumped by callers on explicit retry

    return {
      publishableKey: this.config.get<string>('MOYASAR_PUBLISHABLE_KEY')!,
      amount,
      currency: 'SAR',
      callbackUrl: this.config.get<string>('BILLING_CALLBACK_URL')!,
      givenId: this.buildGivenId(tenantId, attempt),
      metadata: { tenant_id: tenantId, plan_code: plan.code, cycle },
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- billing.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/billing/billing.service.ts src/billing/billing.service.spec.ts package.json package-lock.json
git commit -m "feat(billing): add BillingService.createPaymentIntent with deterministic given_id"
```

---

### Task 9: BillingService — issueInvoice (sequential per-tenant number)

**Files:**
- Modify: `src/billing/billing.service.ts` (add `issueInvoice`)
- Test: `src/billing/billing.service.spec.ts` (add a describe block)

**Interfaces:**
- Consumes: `PrismaService.invoice`, `PrismaService.tenant`; env `ATHAR_SELLER_NAME`.
- Produces: `issueInvoice(args: IssueInvoiceArgs): Promise<Invoice>` and `interface IssueInvoiceArgs { tenantId; subscriptionId; moyasarPaymentId; totalMinor }`. `totalMinor` is the amount charged (halalas). Invoice number is `ATHAR-` + zero-padded sequential count per tenant.

- [ ] **Step 1: Write the failing test (append to billing.service.spec.ts)**

```ts
describe('BillingService.issueInvoice', () => {
  it('creates an invoice with the charged total and a sequential number', async () => {
    const created: any[] = [];
    const prisma = {
      invoice: {
        count: jest.fn().mockResolvedValue(2), // two invoices already exist for this tenant
        create: jest.fn().mockImplementation(({ data }: any) => {
          created.push(data);
          return Promise.resolve({ id: 'inv_3', ...data });
        }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', name: 'Acme Co' }) },
    } as unknown as PrismaService;

    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    const invoice = await svc.issueInvoice({
      tenantId: 't1',
      subscriptionId: 's1',
      moyasarPaymentId: 'payment_x',
      totalMinor: 59900,
    });

    expect(created[0].totalMinor).toBe(59900);
    // sequential per tenant: count was 2 → number is the 3rd
    expect(created[0].number).toBe('ATHAR-000003');
    expect(created[0].sellerName).toBe('Athar');
    expect(created[0].buyerName).toBe('Acme Co');
    expect(created[0].currency).toBe('SAR');
    expect(created[0].status).toBe('issued');
    expect(invoice.id).toBe('inv_3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- billing.service`
Expected: FAIL — `svc.issueInvoice is not a function`.

- [ ] **Step 3: Add `issueInvoice` to `BillingService`**

Add this import at the top of `src/billing/billing.service.ts`:
```ts
import type { Invoice } from '@prisma/client';
```

Add the method and interface inside the class file:
```ts
export interface IssueInvoiceArgs {
  tenantId: string;
  subscriptionId: string;
  moyasarPaymentId: string;
  totalMinor: number; // amount charged, in halalas
}
```

Inside the `BillingService` class:
```ts
  // Sequential, gap-free per-tenant number: ATHAR-000001, ATHAR-000002, ...
  private async nextInvoiceNumber(tenantId: string): Promise<string> {
    const existing = await this.prisma.invoice.count({ where: { tenantId } });
    const next = existing + 1;
    return `ATHAR-${String(next).padStart(6, '0')}`;
  }

  async issueInvoice(args: IssueInvoiceArgs): Promise<Invoice> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: args.tenantId } });
    const sellerName = this.config.get<string>('ATHAR_SELLER_NAME')!;
    const number = await this.nextInvoiceNumber(args.tenantId);
    const issuedAt = new Date();

    return this.prisma.invoice.create({
      data: {
        tenantId: args.tenantId,
        subscriptionId: args.subscriptionId,
        moyasarPaymentId: args.moyasarPaymentId,
        number,
        issuedAt,
        totalMinor: args.totalMinor,
        currency: 'SAR',
        sellerName,
        buyerName: tenant?.name ?? 'Customer',
        status: 'issued',
      },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- billing.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/billing.service.ts src/billing/billing.service.spec.ts
git commit -m "feat(billing): add issueInvoice with sequential numbering"
```

---

### Task 10: BillingService — verifyAndActivate (golden payment rule, idempotent)

**Files:**
- Modify: `src/billing/billing.service.ts` (add `verifyAndActivate`)
- Test: `src/billing/billing.service.spec.ts` (add a describe block)

**Interfaces:**
- Consumes: `MoyasarClient.fetchPayment`; `PrismaService.subscription`, `PrismaService.invoice`; `issueInvoice`; `resolvePlan`, `priceForCycle`.
- Produces: `verifyAndActivate(paymentId: string): Promise<ActivationResult>` and `interface ActivationResult { activated: boolean; reason?: string }`. Activates ONLY when the re-fetched payment matches `status==='paid'`, `amount===expected`, `currency==='SAR'`, `metadata.tenant_id===subscription.tenantId`. Idempotent: if an `Invoice` with that `moyasarPaymentId` already exists → `{ activated: false, reason: 'already_processed' }` with no side effects.

- [ ] **Step 1: Write the failing test (append to billing.service.spec.ts)**

```ts
describe('BillingService.verifyAndActivate', () => {
  function paidPayment(overrides: Partial<any> = {}) {
    return {
      id: 'payment_x',
      status: 'paid',
      amount: 59900,
      currency: 'SAR',
      source: { type: 'creditcard', company: 'mada' },
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
      ...overrides,
    };
  }

  function prismaWith(opts: {
    existingInvoice?: any;
    subscription?: any;
  }) {
    return {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(opts.existingInvoice ?? null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'inv_1', ...data })),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(opts.subscription ?? null),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data })),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', name: 'Acme' }) },
    } as unknown as PrismaService;
  }

  it('activates: trialing → active, sets currentPeriodEnd, issues invoice', async () => {
    const prisma = prismaWith({
      subscription: { id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial' },
    });
    const moyasar = { fetchPayment: jest.fn().mockResolvedValue(paidPayment()) };
    const moduleRef = await buildService(prisma, moyasar);
    const svc = moduleRef.get(BillingService);

    const result = await svc.verifyAndActivate('payment_x');

    expect(result.activated).toBe(true);
    expect(moyasar.fetchPayment).toHaveBeenCalledWith('payment_x');
    const updateArg = (prisma.subscription.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.status).toBe('active');
    expect(updateArg.data.plan).toBe('business');
    expect(updateArg.data.currentPeriodEnd).toBeInstanceOf(Date);
    expect((prisma.invoice.create as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: existing invoice for the payment → no double activation', async () => {
    const prisma = prismaWith({
      existingInvoice: { id: 'inv_existing', moyasarPaymentId: 'payment_x' },
      subscription: { id: 's1', tenantId: 't1', status: 'active', plan: 'business' },
    });
    const moyasar = { fetchPayment: jest.fn().mockResolvedValue(paidPayment()) };
    const moduleRef = await buildService(prisma, moyasar);
    const svc = moduleRef.get(BillingService);

    const result = await svc.verifyAndActivate('payment_x');

    expect(result).toEqual({ activated: false, reason: 'already_processed' });
    expect((prisma.subscription.update as jest.Mock)).not.toHaveBeenCalled();
    expect((prisma.invoice.create as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does not activate when status is not paid', async () => {
    const prisma = prismaWith({
      subscription: { id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial' },
    });
    const moyasar = { fetchPayment: jest.fn().mockResolvedValue(paidPayment({ status: 'initiated' })) };
    const moduleRef = await buildService(prisma, moyasar);
    const svc = moduleRef.get(BillingService);

    const result = await svc.verifyAndActivate('payment_x');
    expect(result).toEqual({ activated: false, reason: 'not_paid' });
    expect((prisma.subscription.update as jest.Mock)).not.toHaveBeenCalled();
  });

  it('treats amount mismatch as tampering — no activation', async () => {
    const prisma = prismaWith({
      subscription: { id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial' },
    });
    const moyasar = { fetchPayment: jest.fn().mockResolvedValue(paidPayment({ amount: 100 })) };
    const moduleRef = await buildService(prisma, moyasar);
    const svc = moduleRef.get(BillingService);

    const result = await svc.verifyAndActivate('payment_x');
    expect(result).toEqual({ activated: false, reason: 'amount_mismatch' });
    expect((prisma.invoice.create as jest.Mock)).not.toHaveBeenCalled();
  });

  it('treats currency mismatch as tampering — no activation', async () => {
    const prisma = prismaWith({
      subscription: { id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial' },
    });
    const moyasar = { fetchPayment: jest.fn().mockResolvedValue(paidPayment({ currency: 'USD' })) };
    const moduleRef = await buildService(prisma, moyasar);
    const svc = moduleRef.get(BillingService);

    const result = await svc.verifyAndActivate('payment_x');
    expect(result).toEqual({ activated: false, reason: 'currency_mismatch' });
  });

  it('treats tenant_id mismatch as tampering — no activation', async () => {
    const prisma = prismaWith({
      subscription: { id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial' },
    });
    const moyasar = {
      fetchPayment: jest
        .fn()
        .mockResolvedValue(paidPayment({ metadata: { tenant_id: 'EVIL', plan_code: 'business', cycle: 'monthly' } })),
    };
    const moduleRef = await buildService(prisma, moyasar);
    const svc = moduleRef.get(BillingService);

    const result = await svc.verifyAndActivate('payment_x');
    expect(result).toEqual({ activated: false, reason: 'tenant_mismatch' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- billing.service`
Expected: FAIL — `svc.verifyAndActivate is not a function`.

- [ ] **Step 3: Add `verifyAndActivate` to `BillingService`**

Add the import for plan period math (already importing `resolvePlan`, `priceForCycle`). Add interface + method:
```ts
export interface ActivationResult {
  activated: boolean;
  reason?: string;
}
```

Inside the `BillingService` class:
```ts
  // Adds one billing period from `from`: 1 month (monthly) or 12 months (annual).
  private addPeriod(from: Date, cycle: string): Date {
    const next = new Date(from);
    next.setUTCMonth(next.getUTCMonth() + (cycle === 'annual' ? 12 : 1));
    return next;
  }

  // Golden payment rule: activate ONLY after re-fetching the payment with the secret key
  // and matching status/amount/currency/metadata.tenant_id. Idempotent on payment.id.
  async verifyAndActivate(paymentId: string): Promise<ActivationResult> {
    // Idempotency: a webhook/callback retry for the same payment must not re-activate.
    const existing = await this.prisma.invoice.findUnique({
      where: { moyasarPaymentId: paymentId },
    });
    if (existing) {
      return { activated: false, reason: 'already_processed' };
    }

    const payment = await this.moyasar.fetchPayment(paymentId);

    if (payment.status !== 'paid') {
      return { activated: false, reason: 'not_paid' };
    }

    const tenantId = payment.metadata.tenant_id;
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      return { activated: false, reason: 'tenant_mismatch' };
    }
    if (subscription.tenantId !== tenantId) {
      return { activated: false, reason: 'tenant_mismatch' };
    }

    const plan = resolvePlan(payment.metadata.plan_code);
    const cycle = payment.metadata.cycle;
    const expectedAmount = priceForCycle(plan, cycle === 'annual' ? 'annual' : 'monthly');
    if (payment.amount !== expectedAmount) {
      return { activated: false, reason: 'amount_mismatch' };
    }
    if (payment.currency !== 'SAR') {
      return { activated: false, reason: 'currency_mismatch' };
    }

    const now = new Date();
    const currentPeriodEnd = this.addPeriod(now, cycle);

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        plan: plan.code,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    await this.issueInvoice({
      tenantId,
      subscriptionId: subscription.id,
      moyasarPaymentId: payment.id,
      totalMinor: payment.amount,
    });

    return { activated: true };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- billing.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/billing.service.ts src/billing/billing.service.spec.ts
git commit -m "feat(billing): add verifyAndActivate with re-fetch, tamper checks, idempotency"
```

---

### Task 11: BillingService — transitionStatus, getSubscriptionView, cancel, getInvoice

**Files:**
- Modify: `src/billing/billing.service.ts` (add four methods)
- Test: `src/billing/billing.service.spec.ts` (add describe blocks)

**Interfaces:**
- Consumes: `PrismaService.subscription`, `PrismaService.usageRecord`, `PrismaService.invoice`; `resolvePlan`, `getCap`; `monthWindowStart` from `usage.guard`.
- Produces:
  - `transitionStatus(tenantId: string, status: SubscriptionStatusLiteral): Promise<void>` — updates the current subscription's status.
  - `getSubscriptionView(tenantId: string): Promise<SubscriptionView>` with `interface SubscriptionView { status; planCode; priceSar; cycle; trialEndsAt?; currentPeriodEnd?; usage: { drafts: UsageView; images: UsageView; search: UsageView } }`.
  - `cancel(tenantId: string): Promise<void>` — sets `status='canceled'`, `cancelAtPeriodEnd=true`.
  - `getInvoice(tenantId: string, invoiceId: string): Promise<InvoiceView>` — throws `NotFoundException` if the invoice does not belong to the tenant.

- [ ] **Step 1: Write the failing test (append to billing.service.spec.ts)**

```ts
import { NotFoundException } from '@nestjs/common';

describe('BillingService.transitionStatus', () => {
  it('updates the current subscription status', async () => {
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1', tenantId: 't1', status: 'active', plan: 'business' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    await svc.transitionStatus('t1', 'past_due');
    expect((prisma.subscription.update as jest.Mock)).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'past_due' },
    });
  });
});

describe('BillingService.getSubscriptionView', () => {
  it('returns status, plan, and usage against caps for all three kinds', async () => {
    const usageByKind: Record<string, number> = { text: 30, image: 12, search: 40 };
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          tenantId: 't1',
          status: 'active',
          plan: 'business',
          trialEndsAt: null,
          currentPeriodEnd: new Date('2026-07-29T00:00:00Z'),
        }),
      },
      usageRecord: {
        aggregate: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({ _sum: { units: usageByKind[where.kind] } }),
        ),
      },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    const view = await svc.getSubscriptionView('t1');
    expect(view.status).toBe('active');
    expect(view.planCode).toBe('business');
    expect(view.priceSar).toBe(599);
    expect(view.usage.drafts).toEqual({ used: 30, cap: 120 });
    expect(view.usage.images).toEqual({ used: 12, cap: 60 });
    expect(view.usage.search).toEqual({ used: 40, cap: 200 });
  });
});

describe('BillingService.cancel', () => {
  it('sets canceled + cancelAtPeriodEnd on the current subscription', async () => {
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1', tenantId: 't1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    await svc.cancel('t1');
    expect((prisma.subscription.update as jest.Mock)).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'canceled', cancelAtPeriodEnd: true },
    });
  });
});

describe('BillingService.getInvoice', () => {
  it('returns the invoice when it belongs to the tenant', async () => {
    const invoice = {
      id: 'inv_1',
      tenantId: 't1',
      subscriptionId: 's1',
      moyasarPaymentId: 'payment_x',
      number: 'ATHAR-000001',
      issuedAt: new Date('2026-06-29T12:00:00Z'),
      totalMinor: 59900,
      currency: 'SAR',
      sellerName: 'Athar',
      buyerName: 'Acme',
      status: 'issued',
    };
    const prisma = {
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    const view = await svc.getInvoice('t1', 'inv_1');
    expect(view.number).toBe('ATHAR-000001');
    expect(view.issuedAt).toBe('2026-06-29T12:00:00.000Z');
  });

  it('throws NotFound when the invoice belongs to another tenant', async () => {
    const prisma = {
      invoice: { findUnique: jest.fn().mockResolvedValue({ id: 'inv_1', tenantId: 'OTHER' }) },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    await expect(svc.getInvoice('t1', 'inv_1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when the invoice does not exist', async () => {
    const prisma = {
      invoice: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const moduleRef = await buildService(prisma, {});
    const svc = moduleRef.get(BillingService);

    await expect(svc.getInvoice('t1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- billing.service`
Expected: FAIL — the four new methods are not functions.

- [ ] **Step 3: Add the four methods to `BillingService`**

Add imports at the top of `src/billing/billing.service.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { getCap } from './plan-definitions';
import { monthWindowStart } from './usage.guard';
import type {
  SubscriptionStatusLiteral,
  UsageView,
  InvoiceView,
} from './billing.types';
```

Add the view interface near the other exported interfaces:
```ts
export interface SubscriptionView {
  status: SubscriptionStatusLiteral;
  planCode: string;
  priceSar: number;
  cycle: 'monthly' | 'annual';
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  usage: { drafts: UsageView; images: UsageView; search: UsageView };
}
```

Inside the `BillingService` class:
```ts
  async transitionStatus(tenantId: string, status: SubscriptionStatusLiteral): Promise<void> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription for tenant');
    }
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status },
    });
  }

  private async usedFor(tenantId: string, kind: 'text' | 'image' | 'search'): Promise<number> {
    const agg = await this.prisma.usageRecord.aggregate({
      _sum: { units: true },
      where: { tenantId, kind, createdAt: { gte: monthWindowStart() } },
    });
    return agg._sum.units ?? 0;
  }

  async getSubscriptionView(tenantId: string): Promise<SubscriptionView> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription for tenant');
    }
    const plan = resolvePlan(subscription.plan);
    const [textUsed, imageUsed, searchUsed] = await Promise.all([
      this.usedFor(tenantId, 'text'),
      this.usedFor(tenantId, 'image'),
      this.usedFor(tenantId, 'search'),
    ]);
    return {
      status: subscription.status as SubscriptionStatusLiteral,
      planCode: plan.code,
      priceSar: plan.priceSar,
      cycle: plan.billingCycle,
      trialEndsAt: subscription.trialEndsAt?.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
      usage: {
        drafts: { used: textUsed, cap: getCap(plan, 'text') },
        images: { used: imageUsed, cap: getCap(plan, 'image') },
        search: { used: searchUsed, cap: getCap(plan, 'search') },
      },
    };
  }

  async cancel(tenantId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription for tenant');
    }
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'canceled', cancelAtPeriodEnd: true },
    });
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<InvoiceView> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    // Tenant isolation: another tenant's invoice (or a missing one) is a 404, not a 403.
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }
    return {
      id: invoice.id,
      tenantId: invoice.tenantId,
      subscriptionId: invoice.subscriptionId,
      moyasarPaymentId: invoice.moyasarPaymentId,
      number: invoice.number,
      issuedAt: invoice.issuedAt.toISOString(),
      totalMinor: invoice.totalMinor,
      currency: invoice.currency,
      sellerName: invoice.sellerName,
      buyerName: invoice.buyerName,
      status: invoice.status as 'issued' | 'refunded',
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- billing.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/billing/billing.service.ts src/billing/billing.service.spec.ts
git commit -m "feat(billing): add transitionStatus, subscription view, cancel, getInvoice"
```

---

### Task 12: BillingController + module wiring

**Files:**
- Create: `src/billing/billing.controller.ts`
- Create: `src/billing/billing.module.ts`
- Test: `src/billing/billing.controller.spec.ts`
- Modify: `src/app.module.ts` (import `BillingModule`)

**Interfaces:**
- Consumes: `BillingService`; `verifyWebhookSecret` from `webhook-guard`; `MoyasarWebhookEvent` from `billing.types`; `SubscribeDto`; `ConfigService`; Phase-3 `JwtAuthGuard`, `TenantGuard`, `@CurrentTenant() ctx: TenantContext`, `MOYASAR_WEBHOOK_SECRET`.
- Produces: `BillingController` with routes:
  - `POST /billing/subscribe` (guarded) → `PaymentIntentResponse`
  - `POST /billing/webhook` (public) → `{ received: true }`; `401` on secret mismatch
  - `GET /billing/subscription` (guarded) → `SubscriptionView`
  - `POST /billing/cancel` (guarded) → `{ canceled: true }`
  - `GET /billing/invoice/:id` (guarded) → `InvoiceView`
  - `BillingModule` providing `BillingService`, `MoyasarClient` (factory using `MOYASAR_SECRET_KEY`), `UsageGuard`; exports `UsageGuard` (so the engine module can import it) and `BillingService`.

The controller tests instantiate the controller directly with a mocked `BillingService` and a `ConfigService` stub; Phase-3 guards are referenced by token and not exercised in unit tests (they are integration-tested in Phase 3). Use a string literal `'business'`/`'monthly'` to satisfy `SubscribeDto` typing.

- [ ] **Step 1: Write the failing test**

`src/billing/billing.controller.spec.ts`:
```ts
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { MoyasarWebhookEvent } from './billing.types';

const WEBHOOK_SECRET = 'whsec';

function makeController(service: Partial<BillingService>) {
  const config = { get: (k: string) => (k === 'MOYASAR_WEBHOOK_SECRET' ? WEBHOOK_SECRET : undefined) };
  return new BillingController(service as BillingService, config as unknown as ConfigService);
}

const ctx = { userId: 'u1', tenantId: 't1' };

function paidEvent(secret = WEBHOOK_SECRET): MoyasarWebhookEvent {
  return {
    id: 'evt_1',
    type: 'payment_paid',
    created_at: '2026-06-29T00:00:00Z',
    secret_token: secret,
    data: {
      id: 'payment_x',
      status: 'paid',
      amount: 59900,
      currency: 'SAR',
      source: { type: 'creditcard' },
      metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' },
    },
  };
}

describe('BillingController', () => {
  it('POST /subscribe delegates to createPaymentIntent', async () => {
    const intent = { publishableKey: 'pk', amount: 59900, currency: 'SAR' as const, callbackUrl: 'cb', givenId: 'g', metadata: { tenant_id: 't1', plan_code: 'business', cycle: 'monthly' } };
    const service = { createPaymentIntent: jest.fn().mockResolvedValue(intent) };
    const ctrl = makeController(service);
    const res = await ctrl.subscribe(ctx as any, { planCode: 'business', cycle: 'monthly' });
    expect(res).toBe(intent);
    expect(service.createPaymentIntent).toHaveBeenCalledWith('t1', 'business', 'monthly');
  });

  it('POST /webhook with bad secret → 401, no activation', async () => {
    const service = { verifyAndActivate: jest.fn(), transitionStatus: jest.fn() };
    const ctrl = makeController(service);
    await expect(ctrl.webhook(paidEvent('WRONG'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.verifyAndActivate).not.toHaveBeenCalled();
  });

  it('POST /webhook payment_paid → verifyAndActivate, returns 200 received', async () => {
    const service = {
      verifyAndActivate: jest.fn().mockResolvedValue({ activated: true }),
      transitionStatus: jest.fn(),
    };
    const ctrl = makeController(service);
    const res = await ctrl.webhook(paidEvent());
    expect(res).toEqual({ received: true });
    expect(service.verifyAndActivate).toHaveBeenCalledWith('payment_x');
  });

  it('POST /webhook duplicate (already_processed) still returns 200 received', async () => {
    const service = {
      verifyAndActivate: jest.fn().mockResolvedValue({ activated: false, reason: 'already_processed' }),
      transitionStatus: jest.fn(),
    };
    const ctrl = makeController(service);
    const res = await ctrl.webhook(paidEvent());
    expect(res).toEqual({ received: true });
    expect(service.verifyAndActivate).toHaveBeenCalledTimes(1);
  });

  it('POST /webhook payment_failed → transitions current subscription to past_due', async () => {
    const service = { verifyAndActivate: jest.fn(), transitionStatus: jest.fn().mockResolvedValue(undefined) };
    const ctrl = makeController(service);
    const event = { ...paidEvent(), type: 'payment_failed' as const, data: { ...paidEvent().data, status: 'failed' as const } };
    const res = await ctrl.webhook(event);
    expect(res).toEqual({ received: true });
    expect(service.transitionStatus).toHaveBeenCalledWith('t1', 'past_due');
    expect(service.verifyAndActivate).not.toHaveBeenCalled();
  });

  it('GET /subscription delegates to getSubscriptionView', async () => {
    const view = { status: 'active' };
    const service = { getSubscriptionView: jest.fn().mockResolvedValue(view) };
    const ctrl = makeController(service);
    expect(await ctrl.subscription(ctx as any)).toBe(view);
    expect(service.getSubscriptionView).toHaveBeenCalledWith('t1');
  });

  it('POST /cancel delegates to cancel', async () => {
    const service = { cancel: jest.fn().mockResolvedValue(undefined) };
    const ctrl = makeController(service);
    expect(await ctrl.cancel(ctx as any)).toEqual({ canceled: true });
    expect(service.cancel).toHaveBeenCalledWith('t1');
  });

  it('GET /invoice/:id delegates with tenant from context', async () => {
    const inv = { id: 'inv_1' };
    const service = { getInvoice: jest.fn().mockResolvedValue(inv) };
    const ctrl = makeController(service);
    expect(await ctrl.invoice(ctx as any, 'inv_1')).toBe(inv);
    expect(service.getInvoice).toHaveBeenCalledWith('t1', 'inv_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- billing.controller`
Expected: FAIL — cannot find module `./billing.controller`.

- [ ] **Step 3: Implement `src/billing/billing.controller.ts`**

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { TenantContext } from '../auth/tenant-context';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { verifyWebhookSecret } from './webhook-guard';
import type { MoyasarWebhookEvent } from './billing.types';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard, TenantGuard)
  @Post('subscribe')
  async subscribe(@CurrentTenant() ctx: TenantContext, @Body() dto: SubscribeDto) {
    return this.billing.createPaymentIntent(ctx.tenantId, dto.planCode, dto.cycle);
  }

  // Public, server-to-server from Moyasar. No tenant auth — verified by shared secret
  // (constant-time) then a server-side payment re-fetch inside verifyAndActivate.
  @Post('webhook')
  async webhook(@Body() event: MoyasarWebhookEvent) {
    const expected = this.config.get<string>('MOYASAR_WEBHOOK_SECRET')!;
    if (!verifyWebhookSecret(event.secret_token, expected)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    if (event.type === 'payment_paid') {
      // Idempotent on payment.id; never throws a 5xx for "already processed".
      await this.billing.verifyAndActivate(event.data.id);
    } else if (event.type === 'payment_failed') {
      await this.billing.transitionStatus(event.data.metadata.tenant_id, 'past_due');
    }
    // Acknowledge fast for every recognized event so Moyasar does not retry-storm.
    return { received: true };
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('subscription')
  async subscription(@CurrentTenant() ctx: TenantContext) {
    return this.billing.getSubscriptionView(ctx.tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @Post('cancel')
  async cancel(@CurrentTenant() ctx: TenantContext) {
    await this.billing.cancel(ctx.tenantId);
    return { canceled: true };
  }

  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('invoice/:id')
  async invoice(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.billing.getInvoice(ctx.tenantId, id);
  }
}
```

- [ ] **Step 4: Implement `src/billing/billing.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MoyasarClient } from './moyasar.client';
import { UsageGuard } from './usage.guard';

@Module({
  imports: [ConfigModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    UsageGuard,
    {
      provide: MoyasarClient,
      useFactory: (config: ConfigService) =>
        new MoyasarClient(config.get<string>('MOYASAR_SECRET_KEY')!),
      inject: [ConfigService],
    },
  ],
  // UsageGuard is consumed by the Phase-1 engine module; BillingService by any biller.
  exports: [UsageGuard, BillingService],
})
export class BillingModule {}
```

- [ ] **Step 5: Register `BillingModule` in `src/app.module.ts`**

Add `import { BillingModule } from './billing/billing.module';` and add `BillingModule` to the `imports` array.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- billing.controller`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/billing/billing.controller.ts src/billing/billing.module.ts src/billing/billing.controller.spec.ts src/app.module.ts
git commit -m "feat(billing): add BillingController routes and BillingModule wiring"
```

---

### Task 13: Env vars + global ValidationPipe + full suite green

**Files:**
- Modify: `.env.example`
- Modify: `src/main.ts` (ensure a global `ValidationPipe` so `SubscribeDto` is enforced at runtime)

**Interfaces:**
- Consumes: nothing new.
- Produces: documented env surface for billing; runtime DTO validation.

- [ ] **Step 1: Add billing env vars to `.env.example`**

Append:
```
# Moyasar (secrets manager in prod — do NOT commit real values)
MOYASAR_PUBLISHABLE_KEY=pk_test_xxx
MOYASAR_SECRET_KEY=sk_test_xxx
MOYASAR_WEBHOOK_SECRET=whsec_xxx
# Billing
BILLING_CALLBACK_URL=https://app.athar.sa/billing/callback
# Seller identity
ATHAR_SELLER_NAME=Athar
```

- [ ] **Step 2: Ensure a global ValidationPipe in `src/main.ts`**

If not already present from a prior phase, add inside `bootstrap()` after `app.setGlobalPrefix('api/v1')`:
```ts
import { ValidationPipe } from '@nestjs/common';
// ...
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
```
(If a `ValidationPipe` line already exists, leave it — do not duplicate.)

- [ ] **Step 3: Run the full billing suite + typecheck**

Run: `npm run typecheck && npm test -- billing && npm test -- usage.guard`
Expected: all green; no type errors.

- [ ] **Step 4: Commit**

```bash
git add .env.example src/main.ts
git commit -m "chore(billing): document Moyasar env vars and enforce DTO validation"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):

| Spec item | Task(s) |
|---|---|
| `POST /billing/subscribe` (intent, given_id, metadata, callback_url, amount halalas) | 8 (service), 12 (route) |
| `POST /billing/webhook` (public, secret_token timingSafeEqual → 401, re-fetch, payment_paid activates, payment_failed → past_due, 200 fast) | 4, 5, 10, 12 |
| `GET /billing/subscription` (status + usage vs caps) | 11, 12 |
| `POST /billing/cancel` (canceled + cancelAtPeriodEnd) | 11, 12 |
| `GET /billing/invoice/:id` (tenant isolation → 404) | 11, 12 |
| `BillingService`: createPaymentIntent / verifyAndActivate / issueInvoice / transitionStatus | 8 / 10 / 9 / 11 |
| `UsageGuard.canConsume(tenantId, kind)` — caps for text/image/search, past_due/canceled deny | 6 |
| `PlanDefinition` + `TRIAL_PLAN` config | 3 |
| New `Invoice` Prisma model (new migration, LR-004) | 1 |
| Simple subscription invoice: charged total, sequential per-tenant number | 9 |
| Types: `MoyasarWebhookEvent`, `MoyasarPayment`, `Invoice`/`InvoiceView` | 2 |
| Golden payment rule: activate only after re-fetch matches status/amount/currency/metadata.tenant_id | 10 |
| Idempotency: webhook replay/duplicate → no double activation (on payment.id) | 10, 12 |
| Tamper handling: amount/currency/metadata mismatch → no activation | 10 |
| Amounts in minor units everywhere | 3, 8, 9, 10 |
| Multi-tenant isolation (invoice of another tenant → 404) | 11 |
| Engine consumes UsageGuard (exported from module) | 12 |
| Error table: `payment_failed` → past_due; replay → idempotent 200; tamper → no activation; secret mismatch → 401; given_id duplicate → "exists, fetch" | 4, 10, 12 (given_id-duplicate handling is the `already_processed` short-circuit + deterministic given_id) |

**Acceptance-criteria mapping:** trialing→active+invoice on paid webhook (Task 10 test "activates"); failed payment → past_due with retry path (Task 12 `payment_failed` test + Task 10 reactivation on next paid); activation only after re-fetch match (Task 10 mismatch tests); replay idempotent + bad secret 401 (Task 10 `already_processed`, Task 12 `bad secret`); canConsume rejects over-cap for all three kinds incl. search and on past_due/canceled (Task 6); subscription view + cancel + invoice tenant-scoped (Task 11); amounts in halalas (Tasks 3/8/9/10); tenant isolation (Task 11).

**Intentionally deferred (per spec §خارج النطاق):** frontend payment form/pages (Phase 7); auth/registration internals (Phase 3 — guards/decorator are imported, not built here); engine generation logic (Phase 1 — only `canConsume` is provided); multiple plans / upgrade-downgrade / proration; automatic refund flow (manual via Moyasar dashboard — note `payment_refunded`/`invoice_*` event types are typed in Task 2 but not wired to side effects, matching deferral); PDF rendering of the invoice; saved-card recurring auto-renewal. The trial-expiry → past_due transition is implemented as `transitionStatus(tenantId, 'past_due')` (Task 11) and is invoked by a scheduled job whose scheduling belongs to Phase 5 (Reminders) infra; the method and its behavior are covered here.

**2. Placeholder scan:** No "TBD"/"implement later"/"add validation"/"similar to Task N" present. Every code step contains complete code. `verifyWebhookSecret`, `MoyasarClient.fetchPayment`, all `BillingService` methods, and all routes are fully written. The `payment_refunded`/`invoice_*` types are deliberately defined-but-unwired (documented above), not placeholders.

**3. Type consistency:**
- `ConsumeDecision` shape `{ allowed, used, cap, reason? }` — defined Task 2, produced Task 6, identical.
- `MoyasarPayment` / `MoyasarWebhookEvent` — defined Task 2, consumed Tasks 5, 10, 12; field names (`metadata.tenant_id`, `data.id`, `secret_token`) consistent.
- `PaymentIntentResponse`, `ActivationResult`, `SubscriptionView`, `IssueInvoiceArgs`, `InvoiceView` — each defined once and consumed consistently across Tasks 8–12.
- `priceForCycle(plan, cycle)` / `getCap(plan, kind)` / `resolvePlan(code)` — signatures from Task 3 used identically in Tasks 6, 8, 10, 11.
- `monthWindowStart()` — defined Task 6, reused in Task 11 (single source, imported, not redefined).
- `verifyWebhookSecret(received, expected)` — Task 4 signature matches Task 12 usage.
- `MoyasarClient.fetchPayment(id)` — Task 5 signature matches Task 10 usage.
- Prisma `Invoice` fields (Task 1) match `issueInvoice` `data` (Task 9) and `InvoiceView` mapping (Task 11) one-to-one.
- `given_id` is uuidv5 (deterministic per `sub:{tenantId}:{attempt}`) per the spec's `uuidv5("sub:{tenantId}:{attempt}")` and the moyasar skill's deterministic-given_id pattern — consistent in Task 8.

**Scope:** Single subsystem (billing). Produces working, tested software (migrated Invoice table, service with full Moyasar flow, guard consumed by the engine, controller routes) with a passing Jest suite per task.
