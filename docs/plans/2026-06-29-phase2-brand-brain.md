# Brand Brain / Onboarding (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one-time onboarding that turns a website URL + social handles into a deep, fully-editable `BrandProfile` (the reference the content engine reads on every later generation), with automatic analysis that assists but never overrides the customer.

**Architecture:** A NestJS `BrandModule` exposing four REST routes under `api/v1` backed by an `OnboardingService` with three operations: `analyze` (fetch via `SearchProvider`, summarize via `ContentProvider`, cap-limited, records `UsageRecord`), `buildQuestions` (a pure function deriving confirmation questions from the analysis), and `commit` (persists `BrandProfile` + `AccountProfile[]` scoped by `tenantId`). The two engine seams from the foundation (`ContentProvider`, `SearchProvider`) are EXTENDED with `summarize`/`fetch` methods — never redefined. The customer leads; the system only suggests. Fetch failure does not stop onboarding (manual path). PDPL consent is mandatory before any fetch.

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, class-validator / class-transformer, Jest.

## Global Constraints

- Multi-tenant logical: every domain row carries `tenantId`; every query scoped by the current tenant; a `:id` outside the tenant returns `404` (no existence leak). (from foundation)
- Code, identifiers, comments, commit messages: **English only**. Arabic only in user-facing strings (e.g. question prompts, error messages). (from foundation)
- Route prefix `api/v1` is already set globally in the foundation `main.ts` — controllers use bare paths (e.g. `@Controller('brand')`).
- AI text summarization behind `ContentProvider`; page/profile fetching behind `SearchProvider`. Never call Claude/OpenAI/HTTP-fetch SDKs directly from services. (from foundation)
- `tenantId` comes ONLY from the JWT context (`@CurrentTenant() ctx: TenantContext`, `{ userId, tenantId }`), guarded by `JwtAuthGuard, TenantGuard` (Phase 3 — assume they exist). Never from request body/query.
- Every provider call records a `UsageRecord` (`kind: 'search' | 'text'`, `units`, `tenantId`). (from foundation)
- PDPL: `consentAccepted` required before any fetch (`422` if missing); data minimization — fetch only what the profile needs, do not persist raw pages.
- Cost cap: the number of fetch + summarize calls per `analyze` is bounded by a single config; on exceed, stop and surface a partial draft via `notes`.
- New Prisma tables are NOT expected in this phase. `BrandProfile`, `AccountProfile`, `Tenant`, `User`, `UsageRecord` already exist (foundation migration `init`). Only NEW migrations may add tables — never edit `init`.
- Validation via class-validator / class-transformer; errors via a consistent envelope.
- TDD: failing test first, minimal implementation, commit per task. Jest config lives in `package.json` (foundation).
- `commit` initializes `BrandProfile.learnedPreferences = ''` (the engine fills it later).
- `buildQuestions` is a PURE function (no I/O, no injected deps) — unit-testable in isolation.

## File Structure

```
src/engine/providers/content-provider.interface.ts   # MODIFY: add summarize()
src/engine/providers/search-provider.interface.ts    # MODIFY: add fetch()
src/engine/providers/fake-content-provider.ts         # NEW: deterministic test/dev double
src/engine/providers/fake-search-provider.ts          # NEW: deterministic test/dev double
src/engine/providers/provider.tokens.ts               # NEW: DI tokens (re-bind to existing EngineModule strings 'ContentProvider' / 'SearchProvider')

src/auth/current-tenant.decorator.ts                  # NEW (Phase-3 stub): @CurrentTenant + TenantContext
src/auth/guards.ts                                     # NEW (Phase-3 stub): JwtAuthGuard, TenantGuard

src/common/dto-validation.ts                          # NEW: ValidationPipe factory + error envelope
src/common/dto-validation.spec.ts

src/brand/brand.config.ts                             # NEW: analyze caps + defaults (one config)
src/brand/brand.config.spec.ts

src/brand/dto/onboarding-input.dto.ts                 # NEW: OnboardingInput, AccountInput DTOs
src/brand/dto/brand-profile-draft.dto.ts              # NEW: BrandProfileDraft, BrandKitDraft DTOs
src/brand/dto/patch-brand-profile.dto.ts              # NEW: PatchBrandProfileDraft DTO
src/brand/types.ts                                    # NEW: BrandAnalysisResult, FetchStatus, ConfirmationQuestion...

src/brand/build-questions.ts                          # NEW: pure buildQuestions()
src/brand/build-questions.spec.ts

src/brand/onboarding.service.ts                       # NEW: analyze + commit (+ delegates buildQuestions)
src/brand/onboarding.service.spec.ts

src/brand/brand.controller.ts                         # NEW: the 4 REST routes
src/brand/brand.controller.spec.ts

src/brand/brand.module.ts                             # NEW: wires controller + service + providers
src/app.module.ts                                     # MODIFY: import BrandModule + global ValidationPipe
```

**Decomposition rationale:** seam edits + DI tokens + fakes (Task 1) are a self-contained provider-contract change. The Phase-3 auth stubs (Task 2) and validation/envelope (Task 3) are cross-cutting infra. Then config (Task 4), DTOs+types (Task 5), the pure `buildQuestions` (Task 6), the service `analyze`/`commit` (Tasks 7–8), and finally the controller wiring the four routes with guards and tenant scoping (Task 9). Module wiring (Task 10) makes it boot.

> **Important architecture note (DI):** EngineModule (`src/engine/engine.module.ts`) already binds `'ContentProvider'` and `'SearchProvider'` to the real Claude/LiveSearch providers. BrandModule MUST NOT rebind these tokens (duplicate binding throws at runtime). BrandModule imports `EngineModule` and lets the real providers resolve through the shared token. Real providers gain stub `summarize`/`fetch` methods in Task 1 that throw `NotImplementedError`; the production runtime will surface them until a future phase adds real implementations. Tests swap fakes via `Test.createTestingModule({...}).overrideProvider(CONTENT_PROVIDER).useClass(FakeContentProvider)`.

---

### Task 1: Extend engine seams with `summarize` / `fetch` + DI tokens + fakes

**Status:** ✅ Merged to main

**Files:**
- Modify: `src/engine/providers/content-provider.interface.ts`
- Modify: `src/engine/providers/search-provider.interface.ts`
- Create: `src/engine/providers/provider.tokens.ts`
- Create: `src/engine/providers/fake-content-provider.ts`
- Create: `src/engine/providers/fake-search-provider.ts`
- Test: `src/engine/providers/fake-search-provider.spec.ts`

**Interfaces:**
- Consumes: existing `ContentProvider { draft, critique }` and `SearchProvider { research }` (foundation Task 6); `FactSet`, `BrandProfileInput` from `src/engine/types.ts`.
- Produces:
  - `ContentProvider.summarize(input: SummarizeInput): Promise<SummaryResult>` where
    `SummarizeInput = { texts: string[]; goal: 'brand-analysis' }` and
    `SummaryResult = { tone: string; products: string[]; audience: string; keywords: string[]; suggestedTopics: string[]; suggestedCompetitors: string[]; colors: string[]; logoUrl?: string; visualStyle: string; confidence: number }`.
  - `SearchProvider.fetch(input: FetchInput): Promise<FetchResult>` where
    `FetchInput = { url: string }` and
    `FetchResult = { ok: boolean; text?: string; error?: string }`.
  - DI tokens `CONTENT_PROVIDER` and `SEARCH_PROVIDER` (string symbols) from `provider.tokens.ts`.
  - `FakeContentProvider`, `FakeSearchProvider` — deterministic doubles usable in tests and dev wiring.

- [ ] **Step 1: Write the failing test**

`src/engine/providers/fake-search-provider.spec.ts`:
```ts
import { FakeSearchProvider } from './fake-search-provider';
import { FakeContentProvider } from './fake-content-provider';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from './provider.tokens';

describe('engine seam extensions', () => {
  it('FakeSearchProvider.fetch returns ok for a normal url', async () => {
    const sp = new FakeSearchProvider();
    const res = await sp.fetch({ url: 'https://example.com' });
    expect(res.ok).toBe(true);
    expect(typeof res.text).toBe('string');
  });

  it('FakeSearchProvider.fetch fails for a url containing "fail"', async () => {
    const sp = new FakeSearchProvider();
    const res = await sp.fetch({ url: 'https://fail.example.com' });
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.text).toBeUndefined();
  });

  it('FakeContentProvider.summarize returns a structured summary', async () => {
    const cp = new FakeContentProvider();
    const out = await cp.summarize({ texts: ['hello world'], goal: 'brand-analysis' });
    expect(out.tone.length).toBeGreaterThan(0);
    expect(Array.isArray(out.suggestedTopics)).toBe(true);
    expect(out.confidence).toBeGreaterThan(0);
  });

  it('FakeContentProvider.summarize returns low confidence for empty input', async () => {
    const cp = new FakeContentProvider();
    const out = await cp.summarize({ texts: [], goal: 'brand-analysis' });
    expect(out.confidence).toBeLessThan(0.4);
    expect(out.suggestedTopics).toEqual([]);
  });

  it('exposes DI tokens bound to EngineModule string keys', () => {
    // These tokens must match the bindings in src/engine/engine.module.ts
    // so BrandModule and EngineModule share the same provider resolution.
    expect(CONTENT_PROVIDER).toBe('ContentProvider');
    expect(SEARCH_PROVIDER).toBe('SearchProvider');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fake-search-provider`
Expected: FAIL — cannot find `./fake-search-provider` / `./provider.tokens`.

- [ ] **Step 3: Extend the two interface files**

In `src/engine/providers/content-provider.interface.ts`, ADD (keep `DraftInput`, `ContentProvider.draft`, `ContentProvider.critique` exactly as they are; append the new types and method):
```ts
export interface SummarizeInput {
  texts: string[];          // raw page/profile texts fetched from public sources
  goal: 'brand-analysis';
}

export interface SummaryResult {
  tone: string;
  products: string[];
  audience: string;
  keywords: string[];
  suggestedTopics: string[];
  suggestedCompetitors: string[];
  colors: string[];         // extracted from site for brandKit
  logoUrl?: string;
  visualStyle: string;
  confidence: number;       // 0..1 quality of the summary
}
```
Then add this method to the existing `ContentProvider` interface body:
```ts
  summarize(input: SummarizeInput): Promise<SummaryResult>;
```

In `src/engine/providers/search-provider.interface.ts`, ADD (keep `SearchProvider.research` exactly; append the new types and method):
```ts
export interface FetchInput {
  url: string;              // public website page or social profile url
}

export interface FetchResult {
  ok: boolean;
  text?: string;            // extracted text when ok
  error?: string;           // reason when not ok
}
```
Then add this method to the existing `SearchProvider` interface body:
```ts
  fetch(input: FetchInput): Promise<FetchResult>;
```

- [ ] **Step 4: Create DI tokens**

`src/engine/providers/provider.tokens.ts`:
```ts
// DI tokens for the engine seams. Services depend on these, not concretes.
// Values MUST match the bindings in src/engine/engine.module.ts so BrandModule
// and EngineModule resolve to the same provider instance at the root injector.
export const CONTENT_PROVIDER = 'ContentProvider';
export const SEARCH_PROVIDER = 'SearchProvider';
```

- [ ] **Step 5: Create the fakes (full interface implementations)**

`src/engine/providers/fake-search-provider.ts`:
```ts
import type { SearchProvider } from './search-provider.interface';
import type { FetchInput, FetchResult } from './search-provider.interface';
import type { FactSet, BrandProfileInput } from '../types';

// Deterministic double: any url containing "fail" simulates an unreachable source.
export class FakeSearchProvider implements SearchProvider {
  async research(_topic: string, _brand: BrandProfileInput): Promise<FactSet> {
    return { hasFactualClaim: false, facts: [] };
  }

  async fetch(input: FetchInput): Promise<FetchResult> {
    if (input.url.includes('fail')) {
      return { ok: false, error: 'unreachable' };
    }
    return { ok: true, text: `content of ${input.url}` };
  }
}
```

`src/engine/providers/fake-content-provider.ts`:
```ts
import type { ContentProvider, DraftInput, SummarizeInput, SummaryResult } from './content-provider.interface';
import type { Draft, Rubric, CritiqueResult } from '../types';

// Deterministic double for tests/dev. Empty input -> low confidence, empty suggestions.
export class FakeContentProvider implements ContentProvider {
  async draft(_input: DraftInput): Promise<Draft> {
    return { text: '', citations: [], hashtags: [], imageBrief: '' };
  }

  async critique(_draft: Draft, _rubric: Rubric): Promise<CritiqueResult> {
    return { score: 1, passed: true, issues: [] };
  }

  async summarize(input: SummarizeInput): Promise<SummaryResult> {
    const empty = input.texts.length === 0;
    return {
      tone: empty ? '' : 'professional and approachable',
      products: empty ? [] : ['service'],
      audience: empty ? '' : 'small businesses',
      keywords: empty ? [] : ['growth'],
      suggestedTopics: empty ? [] : ['industry insights', 'tips'],
      suggestedCompetitors: empty ? [] : ['competitor-a'],
      colors: empty ? [] : ['#1A73E8'],
      logoUrl: undefined,
      visualStyle: empty ? '' : 'clean, modern',
      confidence: empty ? 0.2 : 0.8,
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- fake-search-provider`
Expected: PASS.

- [ ] **Step 7: Typecheck (the foundation engine type test must still pass)**

Run: `npm run typecheck && npm test -- engine/types`
Expected: PASS — the existing `ContentProvider`/`SearchProvider` stubs in `engine/types.spec.ts` will now FAIL to satisfy the interface because they lack `summarize`/`fetch`. Fix that test's stubs by adding the two methods:

In `src/engine/types.spec.ts`, the `ContentProvider` stub gains:
```ts
      summarize: async () => ({
        tone: '', products: [], audience: '', keywords: [],
        suggestedTopics: [], suggestedCompetitors: [], colors: [],
        visualStyle: '', confidence: 0,
      }),
```
(If the foundation test does not stub a `SearchProvider`, leave it; otherwise add `fetch: async () => ({ ok: true, text: '' })`.)

- [ ] **Step 7b: Add stub `summarize`/`fetch` to the real engine providers**

The interface extension in Step 3 breaks the existing real providers (`ClaudeContentProvider`, `LiveSearchProvider`) at typecheck. Add minimal stubs so they continue to satisfy the interface. Real implementations come in a future phase.

In `src/engine/providers/claude/claude-content.provider.ts`, add to the class body:
```ts
  async summarize(_input: SummarizeInput): Promise<SummaryResult> {
    throw new Error('summarize: not implemented (brand phase requires real impl in a future phase)');
  }
```
And add `SummarizeInput, SummaryResult` to the import from `'../content-provider.interface'`.

In `src/engine/search/live-search.provider.ts`, add to the class body:
```ts
  async fetch(_input: FetchInput): Promise<FetchResult> {
    throw new Error('fetch: not implemented (brand phase requires real impl in a future phase)');
  }
```
And add `FetchInput, FetchResult` to the import from `'../providers/search-provider.interface'`.

Run again: `npm run typecheck && npm test -- engine/types && npm test -- claude-content && npm test -- live-search`
Expected: PASS — existing engine tests still green; new stubs satisfy the interface.

- [ ] **Step 8: Commit**

```bash
git add src/engine/providers src/engine/types.spec.ts
git commit -m "feat: extend content/search seams with summarize and fetch + fakes"
```

---

### Task 2: Phase-3 auth stubs (`@CurrentTenant`, guards)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/auth/current-tenant.decorator.ts`
- Create: `src/auth/guards.ts`
- Test: `src/auth/current-tenant.decorator.spec.ts`

**Interfaces:**
- Produces:
  - `TenantContext = { userId: string; tenantId: string }`.
  - `@CurrentTenant()` param decorator extracting `request.tenant` (a `TenantContext`).
  - `JwtAuthGuard`, `TenantGuard` — pass-through guards that, in the absence of real auth (Phase 3), read `x-tenant-id` / `x-user-id` headers into `request.tenant` so this phase is testable end-to-end. Phase 3 replaces their bodies; the public shape stays.

> Rationale: Phase 3 owns real auth. To keep Phase 2 self-contained and testable without a body/query `tenantId` (Global Constraint), these guards populate `request.tenant` from headers. The controller depends only on `@CurrentTenant()` + the two guard classes, so the swap in Phase 3 is invisible to this code.

- [ ] **Step 1: Write the failing test**

`src/auth/current-tenant.decorator.spec.ts`:
```ts
import { TenantGuard } from './guards';
import type { ExecutionContext } from '@nestjs/common';

function ctxWithHeaders(headers: Record<string, string>): ExecutionContext {
  const req: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard (phase-3 stub)', () => {
  it('populates request.tenant from headers and allows', () => {
    const guard = new TenantGuard();
    const ctx = ctxWithHeaders({ 'x-tenant-id': 't1', 'x-user-id': 'u1' });
    const req: any = ctx.switchToHttp().getRequest();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.tenant).toEqual({ tenantId: 't1', userId: 'u1' });
  });

  it('throws Unauthorized when x-tenant-id is missing', () => {
    const guard = new TenantGuard();
    const ctx = ctxWithHeaders({ 'x-user-id': 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- current-tenant.decorator`
Expected: FAIL — cannot find `./guards`.

- [ ] **Step 3: Implement guards + decorator**

`src/auth/guards.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

export interface TenantContext {
  userId: string;
  tenantId: string;
}

// Phase-3 stub: real JWT validation is added in Phase 3. Here it is a pass-through.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

// Phase-3 stub: derives the tenant from headers and attaches it to the request.
// Phase 3 replaces the body to read it from the verified JWT. Public shape unchanged.
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers['x-tenant-id'];
    const userId = req.headers['x-user-id'];
    if (!tenantId || !userId) {
      throw new UnauthorizedException('missing tenant context');
    }
    req.tenant = { tenantId, userId } as TenantContext;
    return true;
  }
}
```

`src/auth/current-tenant.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from './guards';

export type { TenantContext } from './guards';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenant as TenantContext;
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- current-tenant.decorator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth
git commit -m "feat: add phase-3 auth stubs (CurrentTenant decorator + guards)"
```

---

### Task 3: Validation pipe + consistent error envelope

**Status:** ✅ Merged to main

**Files:**
- Create: `src/common/dto-validation.ts`
- Test: `src/common/dto-validation.spec.ts`

**Interfaces:**
- Produces:
  - `buildValidationPipe(): ValidationPipe` — `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, and an `exceptionFactory` that throws a `422` (`UnprocessableEntityException`) with the envelope `{ error: { code: 'validation_error', message: string, fields: string[] } }`.
  - `errorEnvelope(code, message, fields?)` helper used by the service/controller for non-validation `422`/`404` responses.

> Rationale: the spec's error table demands `422` (consent, missing required fields) carrying the offending fields, and `404` for cross-tenant `:id`. A single envelope keeps them consistent.

- [ ] **Step 1: Write the failing test**

`src/common/dto-validation.spec.ts`:
```ts
import { errorEnvelope, buildValidationPipe } from './dto-validation';
import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

describe('dto-validation', () => {
  it('errorEnvelope shapes a consistent body', () => {
    expect(errorEnvelope('consent_required', 'تتطلّب الموافقة', ['consentAccepted'])).toEqual({
      error: { code: 'consent_required', message: 'تتطلّب الموافقة', fields: ['consentAccepted'] },
    });
  });

  it('errorEnvelope omits fields when not provided', () => {
    expect(errorEnvelope('not_found', 'غير موجود')).toEqual({
      error: { code: 'not_found', message: 'غير موجود', fields: [] },
    });
  });

  it('buildValidationPipe returns a ValidationPipe whose factory throws 422 with fields', () => {
    const pipe = buildValidationPipe();
    expect(pipe).toBeInstanceOf(ValidationPipe);
    const factory = (pipe as any).exceptionFactory as (errors: any[]) => any;
    const err = factory([{ property: 'websiteUrl', constraints: { isUrl: 'bad' } }]);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toEqual({
      error: { code: 'validation_error', message: expect.any(String), fields: ['websiteUrl'] },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dto-validation`
Expected: FAIL — cannot find `./dto-validation`.

- [ ] **Step 3: Implement**

`src/common/dto-validation.ts`:
```ts
import { UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';

export interface ErrorEnvelope {
  error: { code: string; message: string; fields: string[] };
}

export function errorEnvelope(code: string, message: string, fields: string[] = []): ErrorEnvelope {
  return { error: { code, message, fields } };
}

export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const fields = errors.map((e) => e.property);
      return new UnprocessableEntityException(
        errorEnvelope('validation_error', 'بيانات غير صالحة', fields),
      );
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dto-validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/common
git commit -m "feat: add validation pipe and consistent error envelope"
```

---

### Task 4: Brand analyze config (caps + defaults, one module)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/brand/brand.config.ts`
- Test: `src/brand/brand.config.spec.ts`

**Interfaces:**
- Produces: `BRAND_ANALYZE_CONFIG: { maxFetches: number; maxSummarizeRetries: number }` and `DEFAULT_BRAND_KIT: { visualStyle: string; font: string; colors: string[] }`. `maxFetches` is the per-`analyze` fetch+summarize cap (cost constraint); `font` default is `'IBM Plex Sans Arabic'` (from doc 16 / spec brandKit default).

- [ ] **Step 1: Write the failing test**

`src/brand/brand.config.spec.ts`:
```ts
import { BRAND_ANALYZE_CONFIG, DEFAULT_BRAND_KIT } from './brand.config';

describe('brand.config', () => {
  it('caps fetches and summarize retries', () => {
    expect(BRAND_ANALYZE_CONFIG.maxFetches).toBe(6);
    expect(BRAND_ANALYZE_CONFIG.maxSummarizeRetries).toBe(2);
  });
  it('defaults the brand kit font to IBM Plex Sans Arabic', () => {
    expect(DEFAULT_BRAND_KIT.font).toBe('IBM Plex Sans Arabic');
    expect(DEFAULT_BRAND_KIT.colors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- brand.config`
Expected: FAIL — cannot find `./brand.config`.

- [ ] **Step 3: Implement**

`src/brand/brand.config.ts`:
```ts
// One source of truth for analyze cost caps and brand-kit defaults (Global Constraint: cost cap).
export const BRAND_ANALYZE_CONFIG = {
  maxFetches: 6,          // website + up to N account profiles per analyze
  maxSummarizeRetries: 2, // limited retries before falling back to a minimal draft
};

export const DEFAULT_BRAND_KIT = {
  visualStyle: '',
  font: 'IBM Plex Sans Arabic',
  colors: [] as string[],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- brand.config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand/brand.config.ts src/brand/brand.config.spec.ts
git commit -m "feat: add brand analyze config caps and brand-kit defaults"
```

---

### Task 5: Phase types + class-validator DTOs

**Status:** ✅ Merged to main

**Files:**
- Create: `src/brand/types.ts`
- Create: `src/brand/dto/onboarding-input.dto.ts`
- Create: `src/brand/dto/brand-profile-draft.dto.ts`
- Create: `src/brand/dto/patch-brand-profile.dto.ts`
- Test: `src/brand/dto/onboarding-input.dto.spec.ts`

**Interfaces:**
- Produces:
  - Types (`src/brand/types.ts`): `Platform`, `FetchStatus`, `BrandAnalysisResult`, `ConfirmationQuestion`, `ConfirmationAnswer`, `AnalyzeResponse = { analysis: BrandAnalysisResult; questions: ConfirmationQuestion[] }`. Shapes match the spec verbatim.
  - DTOs: `AccountInputDto`, `OnboardingInputDto`, `BrandKitDraftDto`, `BrandProfileDraftDto` (with nested `accounts: AccountInputDto[]`), `PatchBrandProfileDraftDto` (all fields optional).
- Consumes: nothing from earlier tasks beyond `Platform`.

> Decision: `BrandProfileDraftDto` carries the `accounts: AccountInputDto[]` field so the single `POST /brand/profile` body matches the spec's "BrandProfileDraft + accounts" input. `commit(draft, tenantId, accounts)` receives `accounts` separately, so the controller passes `body.accounts` through. `tone` and `topics` are required on the draft (spec: commit rejects missing tone/topics with 422); class-validator enforces non-empty.

- [ ] **Step 1: Write the failing test**

`src/brand/dto/onboarding-input.dto.spec.ts`:
```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OnboardingInputDto } from './onboarding-input.dto';
import { BrandProfileDraftDto } from './brand-profile-draft.dto';

describe('OnboardingInputDto', () => {
  it('accepts a valid input with website and accounts', () => {
    const dto = plainToInstance(OnboardingInputDto, {
      websiteUrl: 'https://example.com',
      accounts: [{ platform: 'linkedin', handle: '@acme' }],
      consentAccepted: true,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a bad website url', () => {
    const dto = plainToInstance(OnboardingInputDto, {
      websiteUrl: 'not-a-url',
      accounts: [],
      consentAccepted: true,
    });
    const errors = validateSync(dto);
    expect(errors.map((e) => e.property)).toContain('websiteUrl');
  });

  it('rejects an unknown platform', () => {
    const dto = plainToInstance(OnboardingInputDto, {
      accounts: [{ platform: 'facebook' }],
      consentAccepted: true,
    });
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires consentAccepted to be a boolean', () => {
    const dto = plainToInstance(OnboardingInputDto, { accounts: [] });
    const errors = validateSync(dto);
    expect(errors.map((e) => e.property)).toContain('consentAccepted');
  });
});

describe('BrandProfileDraftDto', () => {
  it('rejects a draft with empty tone or empty topics', () => {
    const dto = plainToInstance(BrandProfileDraftDto, {
      tone: '',
      audience: 'a',
      goals: 'g',
      topics: [],
      prohibitions: [],
      competitors: [],
      keywords: [],
      brandKit: { colors: [], visualStyle: 's', font: 'f' },
      accounts: [],
    });
    const props = validateSync(dto).map((e) => e.property);
    expect(props).toEqual(expect.arrayContaining(['tone', 'topics']));
  });

  it('accepts a complete valid draft', () => {
    const dto = plainToInstance(BrandProfileDraftDto, {
      tone: 'friendly',
      audience: 'smb',
      goals: 'grow',
      topics: ['tips'],
      prohibitions: [],
      competitors: [],
      keywords: [],
      brandKit: { colors: ['#fff'], visualStyle: 'clean', font: 'IBM Plex Sans Arabic' },
      accounts: [{ platform: 'x', handle: '@acme' }],
    });
    expect(validateSync(dto)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onboarding-input.dto`
Expected: FAIL — cannot find `./onboarding-input.dto`.

- [ ] **Step 3: Implement `src/brand/types.ts`**

```ts
export type Platform = 'linkedin' | 'x';

export interface FetchStatus {
  website?: 'ok' | 'failed' | 'skipped';
  accounts: { platform: Platform; status: 'ok' | 'failed' | 'skipped' }[];
}

export interface BrandAnalysisResult {
  source: 'website' | 'accounts' | 'mixed' | 'manual';
  fetchStatus: FetchStatus;
  tone: string;
  products: string[];
  audience: string;
  keywords: string[];
  suggestedTopics: string[];
  suggestedCompetitors: string[];
  confidence: number;       // 0..1
  notes: string[];          // warnings, e.g. site fetch failed
}

export type ConfirmationField = 'tone' | 'prohibitions' | 'competitors' | 'goals' | 'topics';

export interface ConfirmationQuestion {
  id: string;
  field: ConfirmationField;
  prompt: string;           // Arabic user-facing text
  kind: 'single' | 'multi' | 'text';
  suggestions?: string[];
  required: boolean;
}

export interface ConfirmationAnswer {
  questionId: string;
  field: ConfirmationField;
  value: string | string[];
}

export interface AnalyzeResponse {
  analysis: BrandAnalysisResult;
  questions: ConfirmationQuestion[];
}
```

- [ ] **Step 4: Implement `src/brand/dto/onboarding-input.dto.ts`**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import type { Platform } from '../types';

export class AccountInputDto {
  @IsIn(['linkedin', 'x'])
  platform!: Platform;

  @IsOptional()
  @IsString()
  handle?: string;
}

export class OnboardingInputDto {
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AccountInputDto)
  accounts!: AccountInputDto[];

  @IsBoolean()
  consentAccepted!: boolean;
}
```

- [ ] **Step 5: Implement `src/brand/dto/brand-profile-draft.dto.ts`**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AccountInputDto } from './onboarding-input.dto';

export class BrandKitDraftDto {
  @IsArray()
  @IsString({ each: true })
  colors!: string[];

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsString()
  visualStyle!: string;

  @IsString()
  @IsNotEmpty()
  font!: string;
}

export class BrandProfileDraftDto {
  @IsString()
  @IsNotEmpty()
  tone!: string;

  @IsString()
  audience!: string;

  @IsString()
  goals!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  topics!: string[];

  @IsArray()
  @IsString({ each: true })
  prohibitions!: string[];

  @IsArray()
  @IsString({ each: true })
  competitors!: string[];

  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @ValidateNested()
  @Type(() => BrandKitDraftDto)
  brandKit!: BrandKitDraftDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccountInputDto)
  accounts!: AccountInputDto[];
}
```

- [ ] **Step 6: Implement `src/brand/dto/patch-brand-profile.dto.ts`**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BrandKitDraftDto } from './brand-profile-draft.dto';

// US-2.3: partial edit. Every field optional, but if present it must be valid
// (e.g. tone, if sent, may not be empty; topics, if sent, may not be empty).
export class PatchBrandProfileDraftDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tone?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsString()
  goals?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  topics?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prohibitions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competitors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandKitDraftDto)
  brandKit?: BrandKitDraftDto;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- onboarding-input.dto`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/brand/types.ts src/brand/dto
git commit -m "feat: add brand phase types and class-validator DTOs"
```

---

### Task 6: `buildQuestions` (pure function)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/brand/build-questions.ts`
- Test: `src/brand/build-questions.spec.ts`

**Interfaces:**
- Consumes: `BrandAnalysisResult`, `ConfirmationQuestion` from `src/brand/types.ts` (Task 5).
- Produces: `buildQuestions(analysis: BrandAnalysisResult): ConfirmationQuestion[]` — a pure function (no I/O). Always emits a `topics` question (`required: true`) because the customer leads the axes (AC-3). Emits `tone`, `prohibitions`, `competitors`, `goals` questions (AC-4). Empty/low-confidence fields become `kind: 'text'` manual-entry questions (US-2.1); otherwise `kind: 'multi'`/`'single'` with the analysis values as `suggestions`.

> Decision (deterministic ids): question `id` = the field name. There is exactly one question per field, so field-named ids are stable and collision-free — easy for the UI to map answers back.

- [ ] **Step 1: Write the failing test**

`src/brand/build-questions.spec.ts`:
```ts
import { buildQuestions } from './build-questions';
import type { BrandAnalysisResult } from './types';

function analysis(partial: Partial<BrandAnalysisResult> = {}): BrandAnalysisResult {
  return {
    source: 'website',
    fetchStatus: { website: 'ok', accounts: [] },
    tone: 'professional',
    products: ['x'],
    audience: 'smb',
    keywords: ['k'],
    suggestedTopics: ['tips', 'news'],
    suggestedCompetitors: ['c-a'],
    confidence: 0.8,
    notes: [],
    ...partial,
  };
}

describe('buildQuestions', () => {
  it('always emits exactly one question per field (tone, prohibitions, competitors, goals, topics)', () => {
    const qs = buildQuestions(analysis());
    expect(qs.map((q) => q.field).sort()).toEqual(
      ['competitors', 'goals', 'prohibitions', 'tone', 'topics'].sort(),
    );
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length); // unique ids
  });

  it('topics question is always required (customer leads the axes)', () => {
    const topics = buildQuestions(analysis()).find((q) => q.field === 'topics')!;
    expect(topics.required).toBe(true);
    expect(topics.kind).toBe('multi');
    expect(topics.suggestions).toEqual(['tips', 'news']);
  });

  it('a field with a confident value becomes a single/multi suggestion question', () => {
    const tone = buildQuestions(analysis()).find((q) => q.field === 'tone')!;
    expect(tone.kind).toBe('single');
    expect(tone.suggestions).toEqual(['professional']);
    expect(tone.required).toBe(true);
  });

  it('manual flow: empty tone with low confidence becomes a required text question', () => {
    const a = analysis({ tone: '', confidence: 0.2, source: 'manual' });
    const tone = buildQuestions(a).find((q) => q.field === 'tone')!;
    expect(tone.kind).toBe('text');
    expect(tone.required).toBe(true);
    expect(tone.suggestions).toBeUndefined();
  });

  it('empty suggestedCompetitors yields a non-required text question', () => {
    const a = analysis({ suggestedCompetitors: [] });
    const comp = buildQuestions(a).find((q) => q.field === 'competitors')!;
    expect(comp.kind).toBe('text');
    expect(comp.required).toBe(false);
  });

  it('uses field name as id', () => {
    const qs = buildQuestions(analysis());
    expect(qs.find((q) => q.field === 'topics')!.id).toBe('topics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- build-questions`
Expected: FAIL — cannot find `./build-questions`.

- [ ] **Step 3: Implement**

`src/brand/build-questions.ts`:
```ts
import type { BrandAnalysisResult, ConfirmationQuestion } from './types';

const PROMPTS = {
  tone: 'ما النبرة التي تناسب علامتك؟',
  prohibitions: 'ما الكلمات أو المواضيع الممنوعة؟',
  competitors: 'من أبرز منافسيك؟',
  goals: 'ما هدفك من المحتوى؟',
  topics: 'حدّد محاورك (أضف أو احذف من اقتراحاتنا):',
} as const;

// Pure: derive one confirmation question per field from the analysis.
// No I/O, no deps — unit-testable in isolation.
export function buildQuestions(analysis: BrandAnalysisResult): ConfirmationQuestion[] {
  const lowConfidence = analysis.confidence < 0.4;

  // topics: always required, customer leads (AC-3). Suggestions are a starting point.
  const topics: ConfirmationQuestion = {
    id: 'topics',
    field: 'topics',
    prompt: PROMPTS.topics,
    kind: 'multi',
    suggestions: analysis.suggestedTopics,
    required: true,
  };

  const tone = scalarQuestion('tone', PROMPTS.tone, analysis.tone, lowConfidence, true);
  const goals = scalarQuestion('goals', PROMPTS.goals, analysis.audience ? '' : '', lowConfidence, true);
  const prohibitions = listQuestion('prohibitions', PROMPTS.prohibitions, [], false);
  const competitors = listQuestion(
    'competitors',
    PROMPTS.competitors,
    analysis.suggestedCompetitors,
    false,
  );

  return [tone, prohibitions, competitors, goals, topics];
}

function scalarQuestion(
  field: ConfirmationQuestion['field'],
  prompt: string,
  value: string,
  lowConfidence: boolean,
  required: boolean,
): ConfirmationQuestion {
  const hasValue = value.trim().length > 0 && !lowConfidence;
  if (!hasValue) {
    return { id: field, field, prompt, kind: 'text', required };
  }
  return { id: field, field, prompt, kind: 'single', suggestions: [value], required };
}

function listQuestion(
  field: ConfirmationQuestion['field'],
  prompt: string,
  values: string[],
  required: boolean,
): ConfirmationQuestion {
  if (values.length === 0) {
    return { id: field, field, prompt, kind: 'text', required };
  }
  return { id: field, field, prompt, kind: 'multi', suggestions: values, required };
}
```

> Note: `goals` has no analyzed value in `BrandAnalysisResult` (the spec analysis result has no `goals` field), so it is always a required text question — the customer always states the goal. The expression above passes `''` so `scalarQuestion` yields a `text`/`required` question.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- build-questions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand/build-questions.ts src/brand/build-questions.spec.ts
git commit -m "feat: add pure buildQuestions deriving confirmation questions"
```

---

### Task 7: `OnboardingService.analyze` (fetch + summarize, caps, UsageRecord, consent, failure path)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/brand/onboarding.service.ts`
- Test: `src/brand/onboarding.service.spec.ts`

**Interfaces:**
- Consumes: `CONTENT_PROVIDER`/`SEARCH_PROVIDER` tokens + their interfaces (Task 1); `PrismaService` (foundation Task 4); `BRAND_ANALYZE_CONFIG`, `DEFAULT_BRAND_KIT` (Task 4); types + `buildQuestions` (Tasks 5, 6); `errorEnvelope` (Task 3).
- Produces (this task adds `analyze` + `buildQuestions` delegate; `commit` is Task 8):
  - `analyze(input: OnboardingInputDto, tenantId: string): Promise<BrandAnalysisResult>` — rejects with `UnprocessableEntityException` (consent envelope) when `!input.consentAccepted`; fetches website + accounts via `SearchProvider.fetch` up to `maxFetches`; summarizes fetched texts via `ContentProvider.summarize`; records a `UsageRecord` per provider call (`kind:'search'` per fetch, `kind:'text'` per summarize); sets `fetchStatus`, `source`, `notes`; never throws on a failed fetch.
  - `buildQuestions(analysis): ConfirmationQuestion[]` — delegates to the pure function.

> Decisions (spec-grounded):
> - Consent (AC-8): checked FIRST, before any fetch; `422` with `errorEnvelope('consent_required', ..., ['consentAccepted'])`.
> - Cap (cost): each `fetch` increments a counter; once `maxFetches` is hit, remaining sources are `skipped` and a `notes` entry is added (spec error table "cap exceeded" row).
> - `source`: `'website'` if only site ok, `'accounts'` if only accounts ok, `'mixed'` if both, `'manual'` if nothing fetched (US-2.1).
> - UsageRecord: written via `prisma.usageRecord.create` for every provider call, carrying `tenantId` and `units: 1`.

- [ ] **Step 1: Write the failing test**

`src/brand/onboarding.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import { FakeContentProvider } from '../engine/providers/fake-content-provider';
import { FakeSearchProvider } from '../engine/providers/fake-search-provider';

function makePrismaMock() {
  return {
    usageRecord: { create: jest.fn().mockResolvedValue({}) },
    brandProfile: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    accountProfile: { create: jest.fn() },
  };
}

async function buildService(prisma: any) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OnboardingService,
      { provide: PrismaService, useValue: prisma },
      { provide: CONTENT_PROVIDER, useClass: FakeContentProvider },
      { provide: SEARCH_PROVIDER, useClass: FakeSearchProvider },
    ],
  }).compile();
  return moduleRef.get(OnboardingService);
}

describe('OnboardingService.analyze', () => {
  it('AC-8: rejects with 422 when consent is not accepted, before any fetch', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    await expect(
      svc.analyze({ websiteUrl: 'https://x.com', accounts: [], consentAccepted: false } as any, 't1'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.usageRecord.create).not.toHaveBeenCalled();
  });

  it('AC-1: returns tone/products/audience/keywords for a valid website', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    expect(res.tone.length).toBeGreaterThan(0);
    expect(res.products.length).toBeGreaterThan(0);
    expect(res.audience.length).toBeGreaterThan(0);
    expect(res.keywords.length).toBeGreaterThan(0);
    expect(res.fetchStatus.website).toBe('ok');
    expect(res.source).toBe('website');
  });

  it('records a UsageRecord per provider call (fetch=search, summarize=text)', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [{ platform: 'x', handle: '@a' }], consentAccepted: true } as any,
      't1',
    );
    const kinds = prisma.usageRecord.create.mock.calls.map((c: any[]) => c[0].data.kind);
    expect(kinds.filter((k: string) => k === 'search').length).toBe(2); // website + 1 account
    expect(kinds.filter((k: string) => k === 'text').length).toBe(1);    // one summarize
    prisma.usageRecord.create.mock.calls.forEach((c: any[]) =>
      expect(c[0].data.tenantId).toBe('t1'),
    );
  });

  it('AC-2/US-2.1: a failed website fetch does not throw and is marked failed', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://fail.example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    expect(res.fetchStatus.website).toBe('failed');
    expect(res.notes.length).toBeGreaterThan(0);
    expect(res.source).toBe('manual'); // nothing fetched
  });

  it('caps fetches at maxFetches and notes the skip', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    const accounts = Array.from({ length: 10 }, (_, i) => ({ platform: 'x', handle: `@a${i}` }));
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts, consentAccepted: true } as any,
      't1',
    );
    const fetchCalls = prisma.usageRecord.create.mock.calls
      .map((c: any[]) => c[0].data.kind)
      .filter((k: string) => k === 'search').length;
    expect(fetchCalls).toBe(6); // BRAND_ANALYZE_CONFIG.maxFetches
    expect(res.notes.some((n) => n.includes('سقف') || n.toLowerCase().includes('cap'))).toBe(true);
    expect(res.fetchStatus.accounts.some((a) => a.status === 'skipped')).toBe(true);
  });

  it('buildQuestions delegates to the pure function', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    const res = await svc.analyze(
      { websiteUrl: 'https://example.com', accounts: [], consentAccepted: true } as any,
      't1',
    );
    const qs = svc.buildQuestions(res);
    expect(qs.find((q) => q.field === 'topics')!.required).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onboarding.service`
Expected: FAIL — cannot find `./onboarding.service`.

- [ ] **Step 3: Implement `analyze` + `buildQuestions` (commit stub added in Task 8)**

`src/brand/onboarding.service.ts`:
```ts
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import type { ContentProvider, SummaryResult } from '../engine/providers/content-provider.interface';
import type { SearchProvider } from '../engine/providers/search-provider.interface';
import { BRAND_ANALYZE_CONFIG } from './brand.config';
import { errorEnvelope } from '../common/dto-validation';
import { buildQuestions } from './build-questions';
import type { OnboardingInputDto } from './dto/onboarding-input.dto';
import type {
  BrandAnalysisResult,
  ConfirmationQuestion,
  FetchStatus,
} from './types';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_PROVIDER) private readonly content: ContentProvider,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  // FR-2: pure question derivation, delegated to the pure function.
  buildQuestions(analysis: BrandAnalysisResult): ConfirmationQuestion[] {
    return buildQuestions(analysis);
  }

  // FR-1: fetch + summarize -> unconfirmed draft. Never throws on a failed fetch.
  async analyze(input: OnboardingInputDto, tenantId: string): Promise<BrandAnalysisResult> {
    // AC-8 (PDPL): consent is mandatory before any fetch.
    if (!input.consentAccepted) {
      throw new UnprocessableEntityException(
        errorEnvelope('consent_required', 'يجب قبول الموافقة قبل بدء التحليل', ['consentAccepted']),
      );
    }

    const notes: string[] = [];
    const fetchStatus: FetchStatus = { accounts: [] };
    const texts: string[] = [];
    let fetches = 0;
    let websiteOk = false;
    let anyAccountOk = false;

    // 1) website
    if (input.websiteUrl) {
      if (fetches < BRAND_ANALYZE_CONFIG.maxFetches) {
        fetches++;
        const res = await this.search.fetch({ url: input.websiteUrl });
        await this.recordUsage(tenantId, 'search');
        if (res.ok && res.text) {
          texts.push(res.text);
          fetchStatus.website = 'ok';
          websiteOk = true;
        } else {
          fetchStatus.website = 'failed';
          notes.push('تعذّر جلب الموقع، يمكنك إكمال التهيئة يدوياً');
        }
      } else {
        fetchStatus.website = 'skipped';
      }
    } else {
      fetchStatus.website = 'skipped';
    }

    // 2) accounts (within the fetch cap)
    for (const acc of input.accounts) {
      if (!acc.handle) {
        fetchStatus.accounts.push({ platform: acc.platform, status: 'skipped' });
        continue;
      }
      if (fetches >= BRAND_ANALYZE_CONFIG.maxFetches) {
        fetchStatus.accounts.push({ platform: acc.platform, status: 'skipped' });
        if (!notes.some((n) => n.includes('سقف'))) {
          notes.push('تم بلوغ سقف عمليات الجلب (cap)، عُرضت مسوّدة جزئية');
        }
        continue;
      }
      fetches++;
      const res = await this.search.fetch({ url: acc.handle });
      await this.recordUsage(tenantId, 'search');
      if (res.ok && res.text) {
        texts.push(res.text);
        fetchStatus.accounts.push({ platform: acc.platform, status: 'ok' });
        anyAccountOk = true;
      } else {
        fetchStatus.accounts.push({ platform: acc.platform, status: 'failed' });
      }
    }

    // 3) summarize (one call). Limited retries; on total failure -> minimal draft.
    let summary: SummaryResult | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= BRAND_ANALYZE_CONFIG.maxSummarizeRetries; attempt++) {
      try {
        summary = await this.content.summarize({ texts, goal: 'brand-analysis' });
        await this.recordUsage(tenantId, 'text');
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!summary) {
      notes.push('تعذّر التلخيص، عُرضت مسوّدة بحد أدنى');
      summary = this.emptySummary();
    }
    void lastError;

    const source = this.deriveSource(websiteOk, anyAccountOk);
    return {
      source,
      fetchStatus,
      tone: summary.tone,
      products: summary.products,
      audience: summary.audience,
      keywords: summary.keywords,
      suggestedTopics: summary.suggestedTopics,
      suggestedCompetitors: summary.suggestedCompetitors,
      confidence: source === 'manual' ? Math.min(summary.confidence, 0.3) : summary.confidence,
      notes,
    };
  }

  private deriveSource(
    websiteOk: boolean,
    anyAccountOk: boolean,
  ): BrandAnalysisResult['source'] {
    if (websiteOk && anyAccountOk) return 'mixed';
    if (websiteOk) return 'website';
    if (anyAccountOk) return 'accounts';
    return 'manual';
  }

  private emptySummary(): SummaryResult {
    return {
      tone: '',
      products: [],
      audience: '',
      keywords: [],
      suggestedTopics: [],
      suggestedCompetitors: [],
      colors: [],
      visualStyle: '',
      confidence: 0.2,
    };
  }

  private async recordUsage(tenantId: string, kind: 'search' | 'text'): Promise<void> {
    await this.prisma.usageRecord.create({
      data: { tenantId, kind, units: 1 },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onboarding.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand/onboarding.service.ts src/brand/onboarding.service.spec.ts
git commit -m "feat: add OnboardingService.analyze with caps, usage records, consent gate"
```

---

### Task 8: `OnboardingService.commit` (persist BrandProfile + AccountProfile[])

**Status:** ✅ Merged to main

**Files:**
- Modify: `src/brand/onboarding.service.ts`
- Modify: `src/brand/onboarding.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `BrandProfileDraftDto`, `AccountInputDto`, `DEFAULT_BRAND_KIT`, `errorEnvelope`.
- Produces:
  - `commit(draft: BrandProfileDraftDto, tenantId: string, accounts: AccountInputDto[]): Promise<BrandProfile>` — validates required fields (tone, topics) at the service boundary (`422` envelope `commit_incomplete` if missing); creates a `BrandProfile` row with `tenantId`, `learnedPreferences: ''`, `brandKit` as JSON; creates one `AccountProfile` per account with the same `tenantId` and the new `brandProfileId`; returns the created `BrandProfile`.

> Decision: even though the DTO pipe enforces tone/topics, `commit` re-checks them at the service boundary (spec error table "commit: missing required fields -> 422 naming the fields"; defense in depth, and keeps the service correct when called outside HTTP). `brandKit` falls back to `DEFAULT_BRAND_KIT` fields when absent — but the DTO requires it, so this is a safety merge of `font`.

- [ ] **Step 1: Add the failing tests**

Append to `src/brand/onboarding.service.spec.ts`:
```ts
describe('OnboardingService.commit', () => {
  const draft = {
    tone: 'friendly',
    audience: 'smb',
    goals: 'grow',
    topics: ['tips'],
    prohibitions: ['politics'],
    competitors: ['c-a'],
    keywords: ['growth'],
    brandKit: { colors: ['#fff'], visualStyle: 'clean', font: 'IBM Plex Sans Arabic' },
    accounts: [{ platform: 'x', handle: '@acme' }],
  } as any;

  it('AC-5: creates a BrandProfile with tenantId, learnedPreferences="" and brandKit json', async () => {
    const prisma = makePrismaMock();
    prisma.brandProfile.create.mockResolvedValue({ id: 'b1', tenantId: 't1', ...draft });
    const svc = await buildService(prisma);
    const out = await svc.commit(draft, 't1', draft.accounts);
    expect(out.id).toBe('b1');
    const arg = prisma.brandProfile.create.mock.calls[0][0].data;
    expect(arg.tenantId).toBe('t1');
    expect(arg.learnedPreferences).toBe('');
    expect(arg.brandKit).toEqual(draft.brandKit);
    expect(arg.topics).toEqual(['tips']);
  });

  it('AC-5/AC-7: creates one AccountProfile per account, each scoped by tenantId + brandProfileId', async () => {
    const prisma = makePrismaMock();
    prisma.brandProfile.create.mockResolvedValue({ id: 'b1', tenantId: 't1', ...draft });
    const svc = await buildService(prisma);
    await svc.commit(draft, 't1', draft.accounts);
    expect(prisma.accountProfile.create).toHaveBeenCalledTimes(1);
    const accArg = prisma.accountProfile.create.mock.calls[0][0].data;
    expect(accArg.tenantId).toBe('t1');
    expect(accArg.brandProfileId).toBe('b1');
    expect(accArg.platform).toBe('x');
    expect(accArg.handle).toBe('@acme');
  });

  it('rejects with 422 when tone is missing', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    await expect(svc.commit({ ...draft, tone: '' }, 't1', [])).rejects.toMatchObject({
      response: { error: { code: 'commit_incomplete', fields: ['tone'] } },
    });
    expect(prisma.brandProfile.create).not.toHaveBeenCalled();
  });

  it('rejects with 422 when topics is empty', async () => {
    const prisma = makePrismaMock();
    const svc = await buildService(prisma);
    await expect(svc.commit({ ...draft, topics: [] }, 't1', [])).rejects.toMatchObject({
      response: { error: { code: 'commit_incomplete', fields: ['topics'] } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onboarding.service`
Expected: FAIL — `svc.commit is not a function`.

- [ ] **Step 3: Implement `commit`**

Add the import at the top of `src/brand/onboarding.service.ts`:
```ts
import type { BrandProfile } from '@prisma/client';
import type { BrandProfileDraftDto } from './dto/brand-profile-draft.dto';
import type { AccountInputDto } from './dto/onboarding-input.dto';
```
Add this method to the `OnboardingService` class:
```ts
  // FR-2/FR-3: merge confirmed draft -> persisted BrandProfile + AccountProfile[].
  async commit(
    draft: BrandProfileDraftDto,
    tenantId: string,
    accounts: AccountInputDto[],
  ): Promise<BrandProfile> {
    const missing: string[] = [];
    if (!draft.tone || draft.tone.trim().length === 0) missing.push('tone');
    if (!draft.topics || draft.topics.length === 0) missing.push('topics');
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        errorEnvelope('commit_incomplete', 'حقول إلزامية ناقصة', missing),
      );
    }

    const profile = await this.prisma.brandProfile.create({
      data: {
        tenantId,
        tone: draft.tone,
        audience: draft.audience ?? '',
        goals: draft.goals ?? '',
        topics: draft.topics,
        prohibitions: draft.prohibitions ?? [],
        competitors: draft.competitors ?? [],
        keywords: draft.keywords ?? [],
        brandKit: draft.brandKit as object,
        learnedPreferences: '',
      },
    });

    for (const acc of accounts) {
      await this.prisma.accountProfile.create({
        data: {
          tenantId,
          brandProfileId: profile.id,
          platform: acc.platform,
          handle: acc.handle ?? null,
        },
      });
    }

    return profile;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onboarding.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand/onboarding.service.ts src/brand/onboarding.service.spec.ts
git commit -m "feat: add OnboardingService.commit persisting profile and accounts"
```

---

### Task 9: `BrandController` (4 routes, guards, tenant scoping, 404 on cross-tenant)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/brand/brand.controller.ts`
- Test: `src/brand/brand.controller.spec.ts`

**Interfaces:**
- Consumes: `OnboardingService` (Tasks 7, 8); `@CurrentTenant`, `TenantContext`, guards (Task 2); DTOs (Task 5); `PrismaService` for GET/PATCH reads; `errorEnvelope` (Task 3).
- Produces (all under global `api/v1`, controller path `brand`):
  - `POST /brand/analyze` (`OnboardingInputDto`) -> `AnalyzeResponse` (`{ analysis, questions }`).
  - `POST /brand/profile` (`BrandProfileDraftDto`) -> `BrandProfile`.
  - `GET /brand/profile/:id` -> `BrandProfile` (`404` if not in tenant).
  - `PATCH /brand/profile/:id` (`PatchBrandProfileDraftDto`) -> updated `BrandProfile` (`404` if not in tenant).
- All routes guarded by `JwtAuthGuard, TenantGuard`; `tenantId` from `@CurrentTenant()` only.

> Decision (AC-7, no existence leak): GET/PATCH use `prisma.brandProfile.findFirst({ where: { id, tenantId } })`. A row outside the tenant returns `null` -> `NotFoundException` with `errorEnvelope('not_found', ...)`. PATCH only writes the fields present in the body (partial), so `topics` re-edit is the official axis-reset path (AC-6).

- [ ] **Step 1: Write the failing test**

`src/brand/brand.controller.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

const tenant = { tenantId: 't1', userId: 'u1' };

function makeMocks() {
  const service = {
    analyze: jest.fn(),
    buildQuestions: jest.fn(),
    commit: jest.fn(),
  };
  const prisma = {
    brandProfile: { findFirst: jest.fn(), update: jest.fn() },
  };
  return { service, prisma };
}

async function buildController(service: any, prisma: any) {
  const moduleRef = await Test.createTestingModule({
    controllers: [BrandController],
    providers: [
      { provide: OnboardingService, useValue: service },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return moduleRef.get(BrandController);
}

describe('BrandController', () => {
  it('POST /brand/analyze returns analysis + questions', async () => {
    const { service, prisma } = makeMocks();
    const analysis = { source: 'website', notes: [] };
    service.analyze.mockResolvedValue(analysis);
    service.buildQuestions.mockReturnValue([{ id: 'topics', field: 'topics' }]);
    const ctrl = await buildController(service, prisma);
    const out = await ctrl.analyze({ accounts: [], consentAccepted: true } as any, tenant as any);
    expect(service.analyze).toHaveBeenCalledWith(
      { accounts: [], consentAccepted: true },
      't1',
    );
    expect(out).toEqual({ analysis, questions: [{ id: 'topics', field: 'topics' }] });
  });

  it('POST /brand/profile commits and returns the profile', async () => {
    const { service, prisma } = makeMocks();
    const profile = { id: 'b1', tenantId: 't1' };
    service.commit.mockResolvedValue(profile);
    const ctrl = await buildController(service, prisma);
    const body = { tone: 't', topics: ['x'], accounts: [{ platform: 'x' }] } as any;
    const out = await ctrl.create(body, tenant as any);
    expect(service.commit).toHaveBeenCalledWith(body, 't1', [{ platform: 'x' }]);
    expect(out).toBe(profile);
  });

  it('GET /brand/profile/:id returns the tenant-scoped profile', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue({ id: 'b1', tenantId: 't1' });
    const ctrl = await buildController(service, prisma);
    const out = await ctrl.get('b1', tenant as any);
    expect(prisma.brandProfile.findFirst).toHaveBeenCalledWith({ where: { id: 'b1', tenantId: 't1' } });
    expect(out).toEqual({ id: 'b1', tenantId: 't1' });
  });

  it('AC-7: GET /brand/profile/:id of another tenant returns 404', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue(null);
    const ctrl = await buildController(service, prisma);
    await expect(ctrl.get('other', tenant as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('AC-6: PATCH /brand/profile/:id updates only present fields, tenant-scoped', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue({ id: 'b1', tenantId: 't1' });
    prisma.brandProfile.update.mockResolvedValue({ id: 'b1', tenantId: 't1', topics: ['new'] });
    const ctrl = await buildController(service, prisma);
    const out = await ctrl.patch('b1', { topics: ['new'] } as any, tenant as any);
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { topics: ['new'] },
    });
    expect(out.topics).toEqual(['new']);
  });

  it('AC-7: PATCH of another tenant returns 404 without updating', async () => {
    const { service, prisma } = makeMocks();
    prisma.brandProfile.findFirst.mockResolvedValue(null);
    const ctrl = await buildController(service, prisma);
    await expect(ctrl.patch('other', { tone: 'x' } as any, tenant as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.brandProfile.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- brand.controller`
Expected: FAIL — cannot find `./brand.controller`.

- [ ] **Step 3: Implement the controller**

`src/brand/brand.controller.ts`:
```ts
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { BrandProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, TenantGuard } from '../auth/guards';
import { CurrentTenant, TenantContext } from '../auth/current-tenant.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingInputDto } from './dto/onboarding-input.dto';
import { BrandProfileDraftDto } from './dto/brand-profile-draft.dto';
import { PatchBrandProfileDraftDto } from './dto/patch-brand-profile.dto';
import { errorEnvelope } from '../common/dto-validation';
import type { AnalyzeResponse } from './types';

@Controller('brand')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BrandController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly prisma: PrismaService,
  ) {}

  // FR-1: analyze + questions in one response so the UI starts confirmation immediately.
  @Post('analyze')
  async analyze(
    @Body() input: OnboardingInputDto,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<AnalyzeResponse> {
    const analysis = await this.onboarding.analyze(input, ctx.tenantId);
    const questions = this.onboarding.buildQuestions(analysis);
    return { analysis, questions };
  }

  // FR-2/FR-3: create the profile from the customer-confirmed draft.
  @Post('profile')
  async create(
    @Body() draft: BrandProfileDraftDto,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<BrandProfile> {
    return this.onboarding.commit(draft, ctx.tenantId, draft.accounts);
  }

  // FR-3: read the profile as a reference/context.
  @Get('profile/:id')
  async get(
    @Param('id') id: string,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<BrandProfile> {
    return this.findInTenantOr404(id, ctx.tenantId);
  }

  // US-2.3: partial edit; topics re-edit is the official axis-reset path (AC-6).
  @Patch('profile/:id')
  async patch(
    @Param('id') id: string,
    @Body() patch: PatchBrandProfileDraftDto,
    @CurrentTenant() ctx: TenantContext,
  ): Promise<BrandProfile> {
    await this.findInTenantOr404(id, ctx.tenantId);
    const data: Record<string, unknown> = {};
    if (patch.tone !== undefined) data.tone = patch.tone;
    if (patch.audience !== undefined) data.audience = patch.audience;
    if (patch.goals !== undefined) data.goals = patch.goals;
    if (patch.topics !== undefined) data.topics = patch.topics;
    if (patch.prohibitions !== undefined) data.prohibitions = patch.prohibitions;
    if (patch.competitors !== undefined) data.competitors = patch.competitors;
    if (patch.keywords !== undefined) data.keywords = patch.keywords;
    if (patch.brandKit !== undefined) data.brandKit = patch.brandKit as object;
    return this.prisma.brandProfile.update({ where: { id }, data });
  }

  // AC-7: scope by tenantId; a row outside the tenant is indistinguishable from a missing one.
  private async findInTenantOr404(id: string, tenantId: string): Promise<BrandProfile> {
    const profile = await this.prisma.brandProfile.findFirst({ where: { id, tenantId } });
    if (!profile) {
      throw new NotFoundException(errorEnvelope('not_found', 'الملف غير موجود'));
    }
    return profile;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- brand.controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/brand/brand.controller.ts src/brand/brand.controller.spec.ts
git commit -m "feat: add BrandController with 4 tenant-scoped routes and 404 isolation"
```

---

### Task 10: Wire `BrandModule` + global validation pipe; boot check

**Status:** ✅ Merged to main

**Files:**
- Create: `src/brand/brand.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/brand/brand.module.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–9 + `EngineModule` (which provides the `CONTENT_PROVIDER` / `SEARCH_PROVIDER` tokens).
- Produces: `BrandModule` that imports `EngineModule` (so the shared tokens resolve through the real providers, whose stub `summarize`/`fetch` from Task 1 step 7b throw `NotImplementedError` until a future phase wires real implementations), registers the `OnboardingService` and `BrandController`. Fakes are test-only — they are injected via `Test.createTestingModule(...).overrideProvider(...)`, never bound in the module itself (would conflict with `EngineModule`'s binding at the root injector). `AppModule` imports `BrandModule` and registers `buildValidationPipe()` as a global pipe.

> Decision (DI separation): the runtime binding of `CONTENT_PROVIDER`/`SEARCH_PROVIDER` lives in `EngineModule` only. `BrandModule` consumes it. Tests swap the real providers with `FakeContentProvider`/`FakeSearchProvider` via `overrideProvider` — same shape as `engine.module.spec.ts` already does for SDK stubs. A future phase that adds real `summarize`/`fetch` impls replaces the Task 1 step 7b stubs.

- [ ] **Step 1: Write the failing test**

`src/brand/brand.module.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { BrandModule } from './brand.module';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import { FakeContentProvider } from '../engine/providers/fake-content-provider';
import { FakeSearchProvider } from '../engine/providers/fake-search-provider';

describe('BrandModule', () => {
  it('compiles and resolves the controller + service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BrandModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ usageRecord: { create: jest.fn() }, brandProfile: {}, accountProfile: {} })
      .overrideProvider(CONTENT_PROVIDER)
      .useClass(FakeContentProvider)
      .overrideProvider(SEARCH_PROVIDER)
      .useClass(FakeSearchProvider)
      .compile();

    expect(moduleRef.get(BrandController)).toBeInstanceOf(BrandController);
    expect(moduleRef.get(OnboardingService)).toBeInstanceOf(OnboardingService);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- brand.module`
Expected: FAIL — cannot find `./brand.module`.

- [ ] **Step 3: Implement the module**

`src/brand/brand.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';

// BrandModule reuses EngineModule's CONTENT_PROVIDER / SEARCH_PROVIDER bindings
// (the real providers carry stub summarize/fetch from Task 1 step 7b).
// Fakes are test-only — swap them in via overrideProvider in spec files.
@Module({
  imports: [EngineModule],
  controllers: [BrandController],
  providers: [OnboardingService],
})
export class BrandModule {}
```

- [ ] **Step 4: Register in `app.module.ts` + global pipe**

Modify `src/app.module.ts` to import `BrandModule` and register the global validation pipe:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { BrandModule } from './brand/brand.module';
import { buildValidationPipe } from './common/dto-validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    BrandModule,
  ],
  providers: [{ provide: APP_PIPE, useFactory: buildValidationPipe }],
})
export class AppModule {}
```
(Keep any other modules the foundation already imported; only add `BrandModule`, the `APP_PIPE` provider, and the two new imports.)

- [ ] **Step 5: Run test + full suite + typecheck**

Run: `npm test -- brand.module && npm run typecheck && npm test`
Expected: PASS (all suites green, no type errors).

- [ ] **Step 6: Commit**

```bash
git add src/brand/brand.module.ts src/brand/brand.module.spec.ts src/app.module.ts
git commit -m "feat: wire BrandModule and global validation pipe into app"
```

---

## Self-Review

**1. Spec coverage** (each spec section -> task):

- `OnboardingService` interface (`analyze`/`buildQuestions`/`commit`) -> Tasks 7, 6, 8. ✓
- REST routes `POST /brand/analyze`, `POST /brand/profile`, `GET /brand/profile/:id`, `PATCH /brand/profile/:id` -> Task 9. ✓
- DTO/types (`OnboardingInput`, `AccountInput`, `BrandAnalysisResult`, `FetchStatus`, `BrandProfileDraft`, `BrandKitDraft`, `ConfirmationQuestion`, `ConfirmationAnswer`) -> Task 5 (types) + Task 5 (DTOs). `ConfirmationAnswer` is defined as a type for UI/contract completeness (the merge of answers into a draft happens client-side per the spec's "customer leads" — `POST /brand/profile` receives the already-merged draft, not raw answers). ✓
- Flow: success path (valid website) -> Tasks 7 (analyze ok) + 9 (analyze route) + 8/9 (commit). ✓
- Flow: fetch-failure manual path (US-2.1) -> Task 7 (failed website does not throw, `source='manual'`, notes) + Task 6 (empty fields become required text questions). ✓
- Flow: edit path (US-2.3) -> Task 9 (GET + PATCH partial, topics reset). ✓
- Error table: invalid/unreachable site -> Task 7 (`fetchStatus.website='failed'` + notes, no stop). Account private/missing -> Task 7 (`status='failed'`, continue). Summarize error -> Task 7 (limited retries -> minimal draft + notes). Consent false -> Task 7 (`422`). Commit missing required -> Task 8 (`422` naming fields). Cross-tenant `:id` -> Task 9 (`404`). Cap exceeded -> Task 7 (stop at cap + notes, partial draft). ✓
- AC-1 -> Task 7 test "returns tone/products/audience/keywords". AC-2 -> Task 7 test "failed website does not throw". AC-3 -> Task 6 tests (topics always required, suggestions editable) + Task 8 (only confirmed topics stored). AC-4 -> Task 6 (tone/prohibitions/competitors/goals questions). AC-5 -> Task 8 (create) + Task 9 (GET). AC-6 -> Task 9 (PATCH any field incl. topics). AC-7 -> Task 8 (rows carry tenantId) + Task 9 (`404` cross-tenant). AC-8 -> Task 7 (consent `422`, no fetch before consent). ✓
- Consumes `ContentProvider` (summarize) + `SearchProvider` (fetch) without redefining seams -> Task 1 EXTENDS the existing interfaces (adds methods, keeps `draft`/`critique`/`research`). ✓
- Every provider call records a `UsageRecord` -> Task 7 (`recordUsage` per fetch + per summarize). ✓
- `buildQuestions` pure -> Task 6 (no deps, no I/O; service delegates in Task 7). ✓
- `commit` writes profile + accounts with `tenantId`, `learnedPreferences=''` -> Task 8. ✓

**2. Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"similar to Task N". Every code step contains complete code. The only cross-reference is `src/app.module.ts` ("keep other modules the foundation imported") which is a precise merge instruction, not a placeholder — the full new module body is shown.

**3. Type consistency:**
- `SummaryResult` shape is identical in Task 1 (interface), Task 1 (`FakeContentProvider`), Task 7 (`emptySummary`), and Task 1 Step 7 (foundation test stub). ✓
- `FetchResult` `{ ok, text?, error? }` identical in Task 1 interface, `FakeSearchProvider`, and consumed in Task 7. ✓
- `BrandAnalysisResult` fields used in Task 7 return match Task 5 type and Task 6 consumption exactly (`source`, `fetchStatus`, `tone`, `products`, `audience`, `keywords`, `suggestedTopics`, `suggestedCompetitors`, `confidence`, `notes`). ✓
- `ConfirmationQuestion` `{ id, field, prompt, kind, suggestions?, required }` identical in Task 5 type, Task 6 producer, Task 9 mock. ✓
- `TenantContext { userId, tenantId }` identical in Task 2 (guards), Task 2 (decorator re-export), Task 9 (consumed as `ctx.tenantId`). ✓
- `errorEnvelope(code, message, fields?)` signature identical in Task 3 and all callers (Tasks 7, 8, 9). ✓
- `commit(draft, tenantId, accounts)` signature identical in Task 8 definition and Task 9 call (`draft.accounts` passed). ✓
- DI tokens `CONTENT_PROVIDER`/`SEARCH_PROVIDER` identical strings in Task 1, 7, 10. ✓
- Prisma field names (`brandKit`, `learnedPreferences`, `topics`, `tenantId`, `brandProfileId`, `platform`, `handle`) match the foundation `schema.prisma` exactly. ✓

**Intentionally deferred (out of scope per spec):** the actual generation pipeline, the frontend onboarding UI, `learnedPreferences` learning logic, LinkedIn/X API integration, billing/auth/full-PDPL-deletion. The real `ContentProvider.summarize`/`SearchProvider.fetch` implementations (HTTP fetch + Claude/OpenAI calls) are bound as FAKES here; the engine plan provides the real concretes against the same tokens. `ConfirmationAnswer` -> `BrandProfileDraft` merge is client-side (spec: `POST /brand/profile` receives the merged draft, "customer leads").
