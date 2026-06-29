# Content Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real content engine — a hybrid pipeline (research → draft → critique → image-gate → image → assemble), the async month-plan BullMQ job, and light learning — behind the seams created in [foundation Sprint 0](2026-06-29-foundation-sprint0.md), turning a `GenerationRequest` into a sourced, platform-compliant `Post` with a verified image.

**Architecture:** Five independently testable stages, each a Nest provider with one responsibility, orchestrated by a `PipelineService`. AI lives behind the `ContentProvider` (Anthropic Claude, text), `ImageProvider` (OpenAI gpt-image + `VisionVerifier` + `OverlayRenderer`), and `SearchProvider` (live restricted search) seams from foundation Task 6 — this phase ships the REAL implementations behind those interfaces. A formal 20-image decision gate (build-task #1) fixes the image stage's default `method` and `attempts` before that stage is built. The month-plan runs as a BullMQ job with progress and a hard `skipped_quota` vs `provider_error` distinction. Every AI call records a `UsageRecord`.

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, BullMQ + ioredis (Redis 7), MinIO (S3), `@anthropic-ai/sdk`, `openai`, `twitter-text`, `satori` + `sharp` (overlay), Jest.

## Global Constraints

- Code, identifiers, comments, commit messages: **English only**. Arabic only in user-facing strings and prompt content. (from [foundation](2026-06-29-foundation-sprint0.md) + global rules)
- **Exact model IDs are config/env, never hardcoded.** `ANTHROPIC_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_API_KEY` come from env via `ConfigService`. Providers read them; no string literal model name in code. (from [14-قرارات-التنفيذ.md](../blueprint/14-قرارات-التنفيذ.md))
- AI text behind `ContentProvider`; images behind `ImageProvider`; search behind `SearchProvider`. Never import `@anthropic-ai/sdk` / `openai` / a search SDK outside the provider class that implements its seam. (from [16-معمارية-المحرّك.md](../blueprint/16-معمارية-المحرّك.md))
- Multi-tenant logical: every domain row carries `tenantId`; every query is scoped by `tenantId`. Engine entry points pass `tenantId` explicitly (internal invocation) or derive it from `@CurrentTenant() ctx: TenantContext` where `TenantContext = { userId: string; tenantId: string }` guarded by `JwtAuthGuard, TenantGuard` (Phase 3 — assume exists). (from prompt)
- **Every AI call records a `UsageRecord`** (`kind: 'text' | 'image' | 'search'`, `units`, `costUsd`, `tenantId`, optional `subscriptionId`). (from [16](../blueprint/16-معمارية-المحرّك.md) principle "التكلفة كقيد")
- **No fabricated sources (NFR-6).** Claude writes only from `FactSet` facts; if `hasFactualClaim === false` the post is opinion/tone with zero `citations`. (from [16](../blueprint/16-معمارية-المحرّك.md))
- Live search is **restricted to a trusted-sources whitelist** (shared global domains + per-tenant domains derived from `brand.topics`) and stays inside `brand.topics`. The whitelist is **owned and maintained by this phase** (config, updatable without code deploy), not consumed from elsewhere. (from [16](../blueprint/16-معمارية-المحرّك.md) FR-5)
- Platform limits come from ONE config: `src/config/platform-limits.ts` (foundation Task 5). X counting uses `twitter-text`, never `.length`. (from [15-مواصفات-المنصات.md](../blueprint/15-مواصفات-المنصات.md))
- Post lifecycle: `draft → pending_review → approved → published`. The engine produces a Post at `pending_review`. (from foundation)
- Critique loop is capped at **2–3 rounds** (use 3 as the hard cap); after the cap, pass the best version with visible `issues`. Image regeneration is capped at **2–3** (use 3). (from [16](../blueprint/16-معمارية-المحرّك.md))
- `skipped_quota` (usage cap reached mid-plan) ≠ `provider_error` (provider outage). The first is marked + reported + plan continues, no retry; the second is retried and logged. Never retry a `skipped_quota` post. (from [16](../blueprint/16-معمارية-المحرّك.md) error table)
- TDD: failing test first, minimal impl, commit per task. Jest config already in foundation `package.json`.
- New DB tables/columns go in NEW migrations only (LR-004); never edit foundation's `init` migration.

## File Structure

```
prisma/schema.prisma                                   # MODIFY: add quota/learning columns + TrustedSource table (new migration)
src/engine/engine.module.ts                            # wires all engine providers + queue
src/engine/types.ts                                    # MODIFY: add EngineError, PipelineResult, MonthPlanProgress (extends foundation types)

# Stage 1 — research + trusted sources (owned by this phase)
src/config/trusted-sources.ts                          # global whitelist + per-tenant derivation
src/config/trusted-sources.spec.ts
src/engine/search/source-fetcher.ts                    # fetch page text (whitelist-guarded)
src/engine/search/source-fetcher.spec.ts
src/engine/search/fact-extractor.ts                    # page text -> candidate Facts (Claude)
src/engine/search/fact-extractor.spec.ts
src/engine/search/live-search.provider.ts              # SearchProvider real impl
src/engine/search/live-search.provider.spec.ts

# Stage 2 — draft + Stage 3 — critique (Claude behind ContentProvider)
src/engine/providers/claude/claude.client.ts           # thin Anthropic wrapper (only file importing the SDK)
src/engine/providers/claude/claude.client.spec.ts
src/engine/providers/claude/claude-content.provider.ts # ContentProvider real impl (draft + critique)
src/engine/providers/claude/claude-content.provider.spec.ts
src/engine/draft/rubric.builder.ts                     # Rubric from BrandProfile + limits + prohibitions
src/engine/draft/rubric.builder.spec.ts
src/engine/draft/draft.stage.ts                        # stage 2 unit (calls ContentProvider.draft + records usage)
src/engine/draft/draft.stage.spec.ts
src/engine/draft/critique.stage.ts                     # stage 3 unit (loop, max 3 rounds)
src/engine/draft/critique.stage.spec.ts

# Image decision gate (build-task #1) + Stage 4 — image
src/engine/image/image-gate.config.ts                  # IMAGE_GATE_DECISION fixed by the gate test
src/engine/image/image-gate.config.spec.ts
test/image-gate/run-gate.ts                            # 20-image runner script (real gpt-image)
test/image-gate/run-gate.spec.ts                       # unit test of the breakage-rate math
src/engine/providers/openai/openai-image.client.ts     # thin OpenAI image wrapper (only file importing openai)
src/engine/providers/openai/openai-image.client.spec.ts
src/engine/providers/openai/vision-verifier.ts         # VisionVerifier (reads Arabic text back)
src/engine/providers/openai/vision-verifier.spec.ts
src/engine/providers/openai/overlay-renderer.ts        # OverlayRenderer (Satori+Sharp, kit.font)
src/engine/providers/openai/overlay-renderer.spec.ts
src/engine/providers/openai/gpt-image.provider.ts      # ImageProvider real impl (gate-driven method/attempts)
src/engine/providers/openai/gpt-image.provider.spec.ts
src/engine/storage/image-storage.service.ts            # upload bytes -> MinIO -> url
src/engine/storage/image-storage.service.spec.ts

# Stage 5 — assemble
src/engine/assemble/platform-formatter.ts              # apply platform-limits (twitter-text, hashtags, links, hook)
src/engine/assemble/platform-formatter.spec.ts
src/engine/assemble/assemble.stage.ts                  # Draft+ImageAsset -> persisted Post (pending_review)
src/engine/assemble/assemble.stage.spec.ts

# Orchestration
src/engine/usage/usage.recorder.ts                     # records UsageRecord; quota check
src/engine/usage/usage.recorder.spec.ts
src/engine/pipeline/pipeline.service.ts                # runs stages 1-5 for one post
src/engine/pipeline/pipeline.service.spec.ts

# Month plan (async BullMQ) + light learning
src/engine/month-plan/saudi-calendar.ts                # distributes count over Saudi calendar
src/engine/month-plan/saudi-calendar.spec.ts
src/engine/month-plan/month-plan.processor.ts          # BullMQ worker (progress, skipped_quota vs provider_error)
src/engine/month-plan/month-plan.processor.spec.ts
src/engine/month-plan/month-plan.service.ts            # enqueue + progress read
src/engine/month-plan/month-plan.service.spec.ts
src/engine/learning/learning.service.ts                # diff original<->approved -> learnedPreferences
src/engine/learning/learning.service.spec.ts
```

---

### Task 1: Image decision gate — 20-image Arabic-text breakage test (build-task #1)

> This is the formal decision gate from [16](../blueprint/16-معمارية-المحرّك.md) ("بوابة قرار الصور") and build-task #1 from [14](../blueprint/14-قرارات-التنفيذ.md). It MUST run before the image stage (Task 13) is built: its result fixes the default `method` and `attempts`. The runner uses real gpt-image + a real vision read; the unit test pins the breakage-rate math and the decision rule. The committed `IMAGE_GATE_DECISION` is the artifact downstream tasks import.

**Files:**
- Create: `test/image-gate/run-gate.ts`, `test/image-gate/run-gate.spec.ts`
- Create: `src/engine/image/image-gate.config.ts`, `src/engine/image/image-gate.config.spec.ts`
- Modify: `.env.example` (add `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_VISION_MODEL`)

**Interfaces:**
- Consumes: nothing from earlier engine tasks (intentionally first).
- Produces: `computeBreakageRate(results: GateSample[]): number`, `decideMethod(rate: number): GateDecision`, `GateSample = { intendedText: string; verifiedText: string; broken: boolean }`, `GateDecision = { primaryMethod: 'gpt-image' | 'overlay'; gptImageMaxAttempts: number }`, and the committed const `IMAGE_GATE_DECISION: GateDecision`. `isArabicTextBroken(intended: string, verified: string): boolean`.

- [ ] **Step 1: Add OpenAI env keys to `.env.example`**

Append to `.env.example`:
```
OPENAI_API_KEY=sk-replace-me
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_VISION_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=sk-ant-replace-me
ANTHROPIC_MODEL=claude-sonnet-4-5
```

- [ ] **Step 2: Write the failing test for the breakage math**

`test/image-gate/run-gate.spec.ts`:
```ts
import {
  isArabicTextBroken,
  computeBreakageRate,
  decideMethod,
  GateSample,
} from './run-gate';

describe('image-gate breakage math', () => {
  it('flags broken when normalized verified text differs from intended', () => {
    expect(isArabicTextBroken('ابدأ الآن', 'ابدأ الآن')).toBe(false);
    // mangled letters / missing diacritics-insensitive mismatch
    expect(isArabicTextBroken('ابدأ الآن', 'اىدأ الان xx')).toBe(true);
  });

  it('treats whitespace and tatweel as non-breaking', () => {
    expect(isArabicTextBroken('نمو  الأعمال', 'نموـ الأعمال')).toBe(false);
  });

  it('computes breakage rate as broken/total', () => {
    const samples: GateSample[] = [
      { intendedText: 'a', verifiedText: 'a', broken: false },
      { intendedText: 'b', verifiedText: 'x', broken: true },
      { intendedText: 'c', verifiedText: 'c', broken: false },
      { intendedText: 'd', verifiedText: 'd', broken: false },
    ];
    expect(computeBreakageRate(samples)).toBeCloseTo(0.25, 5);
  });

  it('picks gpt-image when breakage < 10%', () => {
    expect(decideMethod(0.05)).toEqual({ primaryMethod: 'gpt-image', gptImageMaxAttempts: 3 });
  });

  it('picks overlay when breakage >= 10%', () => {
    expect(decideMethod(0.1)).toEqual({ primaryMethod: 'overlay', gptImageMaxAttempts: 0 });
    expect(decideMethod(0.4)).toEqual({ primaryMethod: 'overlay', gptImageMaxAttempts: 0 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- run-gate`
Expected: FAIL — cannot find `./run-gate`.

- [ ] **Step 4: Implement the runner with pure math + a real-call harness**

`test/image-gate/run-gate.ts`:
```ts
import OpenAI from 'openai';

export interface GateSample {
  intendedText: string;
  verifiedText: string;
  broken: boolean;
}

export interface GateDecision {
  primaryMethod: 'gpt-image' | 'overlay';
  gptImageMaxAttempts: number;
}

// Arabic-aware normalization: strip tatweel, diacritics, normalize alef/ya/ta-marbuta,
// collapse whitespace. Used to compare intended vs vision-read text.
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ـ]/g, '') // tatweel
    .replace(/[ً-ْٰ]/g, '') // harakat
    .replace(/[آأإ]/g, 'ا') // alef variants -> alef
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/\s+/g, ' ')
    .trim();
}

export function isArabicTextBroken(intended: string, verified: string): boolean {
  return normalizeArabic(intended) !== normalizeArabic(verified);
}

export function computeBreakageRate(samples: GateSample[]): number {
  if (samples.length === 0) return 0;
  const broken = samples.filter((s) => s.broken).length;
  return broken / samples.length;
}

export function decideMethod(rate: number): GateDecision {
  return rate < 0.1
    ? { primaryMethod: 'gpt-image', gptImageMaxAttempts: 3 }
    : { primaryMethod: 'overlay', gptImageMaxAttempts: 0 };
}

// --- Real-call harness (run manually, not in CI) ---
// Usage: ts-node test/image-gate/run-gate.ts  (requires OPENAI_API_KEY + real tenant topics)
// `texts` MUST be real Arabic strings drawn from actual tenant topics, not synthetic.
export async function runGate(texts: string[]): Promise<{ rate: number; decision: GateDecision; samples: GateSample[] }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const imageModel = process.env.OPENAI_IMAGE_MODEL!;
  const visionModel = process.env.OPENAI_VISION_MODEL!;
  const samples: GateSample[] = [];

  for (const intendedText of texts) {
    const img = await client.images.generate({
      model: imageModel,
      prompt: `A clean social media background with the Arabic text exactly: "${intendedText}". Render the Arabic text accurately, large and centered.`,
      size: '1024x1024',
    });
    const b64 = img.data[0].b64_json!;
    const read = await client.chat.completions.create({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe ONLY the Arabic text visible in this image, verbatim. Output just the text.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
    });
    const verifiedText = (read.choices[0].message.content ?? '').trim();
    samples.push({ intendedText, verifiedText, broken: isArabicTextBroken(intendedText, verifiedText) });
  }

  const rate = computeBreakageRate(samples);
  return { rate, decision: decideMethod(rate), samples };
}

if (require.main === module) {
  const texts = JSON.parse(process.env.GATE_TEXTS ?? '[]') as string[];
  if (texts.length < 20) {
    throw new Error('Provide >= 20 real Arabic texts via GATE_TEXTS env (JSON array).');
  }
  runGate(texts).then((r) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ rate: r.rate, decision: r.decision }, null, 2));
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- run-gate`
Expected: PASS.

- [ ] **Step 6: Run the real gate (20+ real Arabic texts) and record the decision**

Run: `OPENAI_API_KEY=$OPENAI_API_KEY GATE_TEXTS="$(cat test/image-gate/real-tenant-texts.json)" npx ts-node test/image-gate/run-gate.ts`
Expected: prints `{ "rate": <number>, "decision": { "primaryMethod": ..., "gptImageMaxAttempts": ... } }`.
Action: copy the printed `decision` verbatim into `IMAGE_GATE_DECISION` in the next step. (Default below assumes the spec's pass case, breakage < 10% → gpt-image primary; if the run yields ≥10%, write `{ primaryMethod: 'overlay', gptImageMaxAttempts: 0 }` instead.)

- [ ] **Step 7: Write the failing test for the committed decision config**

`src/engine/image/image-gate.config.spec.ts`:
```ts
import { IMAGE_GATE_DECISION } from './image-gate.config';

describe('IMAGE_GATE_DECISION', () => {
  it('is a frozen, valid gate decision', () => {
    expect(['gpt-image', 'overlay']).toContain(IMAGE_GATE_DECISION.primaryMethod);
    expect(IMAGE_GATE_DECISION.gptImageMaxAttempts).toBeGreaterThanOrEqual(0);
    expect(IMAGE_GATE_DECISION.gptImageMaxAttempts).toBeLessThanOrEqual(3);
    if (IMAGE_GATE_DECISION.primaryMethod === 'overlay') {
      expect(IMAGE_GATE_DECISION.gptImageMaxAttempts).toBe(0);
    } else {
      expect(IMAGE_GATE_DECISION.gptImageMaxAttempts).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- image-gate.config`
Expected: FAIL — cannot find `./image-gate.config`.

- [ ] **Step 9: Write the decision config (value = result of Step 6)**

`src/engine/image/image-gate.config.ts`:
```ts
import type { GateDecision } from '../../../test/image-gate/run-gate';

// Fixed by the 20-image Arabic-text breakage gate (build-task #1).
// Recorded run: see test/image-gate/run-gate.ts output. Edit ONLY after re-running the gate.
export const IMAGE_GATE_DECISION: Readonly<GateDecision> = Object.freeze({
  primaryMethod: 'gpt-image',
  gptImageMaxAttempts: 3,
});
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- image-gate.config`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add test/image-gate src/engine/image .env.example
git commit -m "feat(engine): add 20-image Arabic breakage gate and fix image method decision"
```

---

### Task 2: Trusted-sources config (whitelist owned by this phase)

**Files:**
- Create: `src/config/trusted-sources.ts`, `src/config/trusted-sources.spec.ts`

**Interfaces:**
- Consumes: `BrandProfileInput` (foundation `src/engine/types.ts`).
- Produces: `GLOBAL_TRUSTED_DOMAINS: string[]`, `tenantDomainsForTopics(topics: string[]): string[]`, `buildWhitelist(brand: BrandProfileInput): string[]`, `isDomainAllowed(url: string, whitelist: string[]): boolean`.

- [ ] **Step 1: Write the failing test**

`src/config/trusted-sources.spec.ts`:
```ts
import {
  GLOBAL_TRUSTED_DOMAINS,
  buildWhitelist,
  isDomainAllowed,
} from './trusted-sources';
import type { BrandProfileInput } from '../engine/types';

const brand = (topics: string[]): BrandProfileInput => ({
  id: 't', tenantId: 'tn', tone: '', topics, prohibitions: [],
  competitors: [], keywords: [], learnedPreferences: '',
  brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
});

describe('trusted-sources', () => {
  it('global whitelist contains authoritative domains and no duplicates', () => {
    expect(GLOBAL_TRUSTED_DOMAINS).toContain('reuters.com');
    expect(new Set(GLOBAL_TRUSTED_DOMAINS).size).toBe(GLOBAL_TRUSTED_DOMAINS.length);
  });

  it('whitelist = global + tenant topic-derived domains, deduped', () => {
    const wl = buildWhitelist(brand(['fintech', 'reuters.com']));
    expect(wl).toEqual(expect.arrayContaining(GLOBAL_TRUSTED_DOMAINS));
    expect(wl).toContain('reuters.com');
    expect(new Set(wl).size).toBe(wl.length);
  });

  it('allows subdomains of a whitelisted domain', () => {
    const wl = ['reuters.com'];
    expect(isDomainAllowed('https://www.reuters.com/x', wl)).toBe(true);
    expect(isDomainAllowed('https://sub.reuters.com/y', wl)).toBe(true);
  });

  it('rejects non-whitelisted and look-alike domains', () => {
    const wl = ['reuters.com'];
    expect(isDomainAllowed('https://reuters.com.evil.com/x', wl)).toBe(false);
    expect(isDomainAllowed('https://notreuters.com/x', wl)).toBe(false);
    expect(isDomainAllowed('not a url', wl)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trusted-sources`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the config**

`src/config/trusted-sources.ts`:
```ts
import type { BrandProfileInput } from '../engine/types';

// Shared, authoritative domains usable by every tenant. Updatable without a code deploy
// in production via an env/JSON override (see ENGINE_TRUSTED_DOMAINS_EXTRA below).
export const GLOBAL_TRUSTED_DOMAINS: string[] = [
  'reuters.com',
  'bloomberg.com',
  'spa.gov.sa',
  'argaam.com',
  'stats.gov.sa',
  'sama.gov.sa',
  'mc.gov.sa',
  'vision2030.gov.sa',
  'who.int',
  'worldbank.org',
  'oecd.org',
  'mckinsey.com',
  'hbr.org',
  'gartner.com',
];

// A topic entry that is itself a bare domain becomes a tenant-specific trusted domain.
// Free-text topics do not add domains (search stays inside global whitelist for those).
export function tenantDomainsForTopics(topics: string[]): string[] {
  const domainLike = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  return topics.map((t) => t.trim().toLowerCase()).filter((t) => domainLike.test(t));
}

export function buildWhitelist(brand: BrandProfileInput): string[] {
  const extra = (process.env.ENGINE_TRUSTED_DOMAINS_EXTRA ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const all = [...GLOBAL_TRUSTED_DOMAINS, ...extra, ...tenantDomainsForTopics(brand.topics)];
  return Array.from(new Set(all));
}

export function isDomainAllowed(url: string, whitelist: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return whitelist.some((d) => host === d || host.endsWith(`.${d}`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- trusted-sources`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/trusted-sources.ts src/config/trusted-sources.spec.ts
git commit -m "feat(engine): add trusted-sources whitelist config owned by engine"
```

---

### Task 3: Extend engine types + schema (quota/learning columns, error kinds)

> Adds the engine's own types on top of foundation `src/engine/types.ts`, and the DB columns the pipeline needs, in a NEW migration (LR-004). Foundation already has `Post`, `ImageAsset`, `SourceCitation`, `UsageRecord`; this adds a `quotaStatus` to `Post`, `originalText` for the learning diff, and a `MonthPlan` table for progress tracking.

**Files:**
- Modify: `src/engine/types.ts` (append, do not redefine existing types)
- Modify: `prisma/schema.prisma`
- Create: `src/engine/types.spec.ts` (extend; or add a new `engine-types-phase1.spec.ts`)

**Interfaces:**
- Consumes: foundation `Draft`, `FactSet`, `ImageAsset`, `Platform`, `ContentType`, `BrandProfileInput`.
- Produces: `type EngineErrorKind = 'provider_error' | 'skipped_quota'`, `class EngineError extends Error { kind: EngineErrorKind }`, `type QuotaStatus = 'ok' | 'skipped_quota'`, `interface PipelineResult { postId: string; quotaStatus: QuotaStatus; critiqueIssues: string[]; imageMethod: ImageAsset['method'] }`, `interface MonthPlanProgress { total: number; completed: number; failed: number; skippedQuota: number; status: 'queued' | 'running' | 'done' }`. Prisma: `Post.quotaStatus String @default("ok")`, `Post.originalText String?`, model `MonthPlan`.

- [ ] **Step 1: Write the failing test**

`src/engine/types.spec.ts`:
```ts
import { EngineError } from './types';
import type { EngineErrorKind, PipelineResult, MonthPlanProgress, QuotaStatus } from './types';

describe('engine phase-1 types', () => {
  it('EngineError carries a discriminating kind', () => {
    const e = new EngineError('quota hit', 'skipped_quota');
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe<EngineErrorKind>('skipped_quota');
    expect(e.message).toBe('quota hit');
  });

  it('PipelineResult and MonthPlanProgress shapes compile', () => {
    const r: PipelineResult = {
      postId: 'p1', quotaStatus: 'ok' as QuotaStatus, critiqueIssues: [], imageMethod: 'gpt-image',
    };
    const p: MonthPlanProgress = { total: 5, completed: 1, failed: 0, skippedQuota: 0, status: 'running' };
    expect(r.postId).toBe('p1');
    expect(p.total).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- engine/types`
Expected: FAIL — `EngineError` not exported.

- [ ] **Step 3: Append the new types to `src/engine/types.ts`**

```ts
// --- Phase 1 (content engine) additions ---
export type EngineErrorKind = 'provider_error' | 'skipped_quota';

export class EngineError extends Error {
  constructor(message: string, public readonly kind: EngineErrorKind) {
    super(message);
    this.name = 'EngineError';
  }
}

export type QuotaStatus = 'ok' | 'skipped_quota';

export interface PipelineResult {
  postId: string;
  quotaStatus: QuotaStatus;
  critiqueIssues: string[];
  imageMethod: ImageAsset['method'];
}

export interface MonthPlanProgress {
  total: number;
  completed: number;
  failed: number;
  skippedQuota: number;
  status: 'queued' | 'running' | 'done';
}
```

- [ ] **Step 4: Add the schema changes**

In `prisma/schema.prisma`, add to `model Post` (after `status`):
```prisma
  quotaStatus  String   @default("ok") // 'ok' | 'skipped_quota'
  originalText String?  // first generated text, kept for the learning diff
  monthPlanId  String?
  monthPlan    MonthPlan? @relation(fields: [monthPlanId], references: [id])
```

Add the new model:
```prisma
model MonthPlan {
  id           String   @id @default(cuid())
  tenantId     String
  total        Int
  completed    Int      @default(0)
  failed       Int      @default(0)
  skippedQuota Int      @default(0)
  status       String   @default("queued") // 'queued' | 'running' | 'done'
  createdAt    DateTime @default(now())
  posts        Post[]
  @@index([tenantId])
}
```

- [ ] **Step 5: Create the migration and generate the client**

Run: `npx prisma migrate dev --name engine_quota_learning_monthplan`
Expected: a NEW migration created and applied; client regenerated. (Do NOT edit the foundation `init` migration.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- engine/types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/types.spec.ts prisma/
git commit -m "feat(engine): add engine error/result types and quota/monthplan schema"
```

---

### Task 4: Claude client (thin Anthropic wrapper — the only file importing the SDK)

**Files:**
- Create: `src/engine/providers/claude/claude.client.ts`, `src/engine/providers/claude/claude.client.spec.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `ConfigService` (env `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`).
- Produces: `ClaudeClient` with `complete(opts: { system: string; user: string; maxTokens?: number }): Promise<{ text: string; inputTokens: number; outputTokens: number }>`. Throws `EngineError(msg, 'provider_error')` on SDK failure.

- [ ] **Step 1: Install the SDK**

```bash
npm i @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test (SDK mocked)**

`src/engine/providers/claude/claude.client.spec.ts`:
```ts
import { ClaudeClient } from './claude.client';
import { EngineError } from '../../types';

const createMock = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: (...a: unknown[]) => createMock(...a) },
  }));
});

const config = { get: (k: string) => ({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'test-model' }[k]) } as any;

describe('ClaudeClient', () => {
  beforeEach(() => createMock.mockReset());

  it('returns text and token counts and passes the configured model', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
    const client = new ClaudeClient(config);
    const res = await client.complete({ system: 's', user: 'u' });
    expect(res).toEqual({ text: 'hello', inputTokens: 10, outputTokens: 4 });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model', system: 's' }),
    );
  });

  it('wraps SDK errors as provider_error EngineError', async () => {
    createMock.mockRejectedValue(new Error('503'));
    const client = new ClaudeClient(config);
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'provider_error',
    });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(EngineError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- claude.client`
Expected: FAIL — cannot find `./claude.client`.

- [ ] **Step 4: Implement the client**

`src/engine/providers/claude/claude.client.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { EngineError } from '../../types';

export interface CompleteOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class ClaudeClient {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.anthropic = new Anthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') });
    this.model = config.get<string>('ANTHROPIC_MODEL')!;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    try {
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens ?? 2048,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      });
      const text = res.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');
      return {
        text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    } catch (err) {
      throw new EngineError(`Anthropic call failed: ${(err as Error).message}`, 'provider_error');
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- claude.client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/providers/claude/claude.client.ts src/engine/providers/claude/claude.client.spec.ts package.json package-lock.json
git commit -m "feat(engine): add thin Anthropic Claude client wrapper"
```

---

### Task 5: Source fetcher (whitelist-guarded page fetch) — Stage 1 part A

**Files:**
- Create: `src/engine/search/source-fetcher.ts`, `src/engine/search/source-fetcher.spec.ts`

**Interfaces:**
- Consumes: `isDomainAllowed` (Task 2).
- Produces: `SourceFetcher` with `fetchPage(url: string, whitelist: string[]): Promise<{ url: string; title: string; text: string } | null>`. Returns `null` (does NOT throw) for non-whitelisted URLs or fetch failures, so the caller treats them as "no source".

- [ ] **Step 1: Write the failing test**

`src/engine/search/source-fetcher.spec.ts`:
```ts
import { SourceFetcher } from './source-fetcher';

describe('SourceFetcher', () => {
  const wl = ['reuters.com'];

  it('returns null for a non-whitelisted url without fetching', async () => {
    const httpGet = jest.fn();
    const f = new SourceFetcher(httpGet);
    expect(await f.fetchPage('https://evil.com/a', wl)).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('extracts title and stripped text from a whitelisted page', async () => {
    const html = '<html><head><title>SAMA report</title></head><body><p>Inflation is 2%.</p><script>x()</script></body></html>';
    const httpGet = jest.fn().mockResolvedValue(html);
    const f = new SourceFetcher(httpGet);
    const res = await f.fetchPage('https://www.reuters.com/x', wl);
    expect(res).toEqual({ url: 'https://www.reuters.com/x', title: 'SAMA report', text: expect.stringContaining('Inflation is 2%.') });
    expect(res!.text).not.toContain('x()');
  });

  it('returns null when the fetch throws', async () => {
    const httpGet = jest.fn().mockRejectedValue(new Error('timeout'));
    const f = new SourceFetcher(httpGet);
    expect(await f.fetchPage('https://reuters.com/x', wl)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- source-fetcher`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the fetcher**

`src/engine/search/source-fetcher.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { isDomainAllowed } from '../../config/trusted-sources';

export type HttpGet = (url: string) => Promise<string>;

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

const defaultHttpGet: HttpGet = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

@Injectable()
export class SourceFetcher {
  constructor(private readonly httpGet: HttpGet = defaultHttpGet) {}

  async fetchPage(url: string, whitelist: string[]): Promise<FetchedPage | null> {
    if (!isDomainAllowed(url, whitelist)) return null;
    try {
      const html = await this.httpGet(url);
      const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { url, title, text };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- source-fetcher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/search/source-fetcher.ts src/engine/search/source-fetcher.spec.ts
git commit -m "feat(engine): add whitelist-guarded source fetcher"
```

---

### Task 6: Fact extractor (page text -> candidate Facts via Claude) — Stage 1 part B

**Files:**
- Create: `src/engine/search/fact-extractor.ts`, `src/engine/search/fact-extractor.spec.ts`

**Interfaces:**
- Consumes: `ClaudeClient` (Task 4), `FetchedPage` (Task 5), `Fact` (foundation types).
- Produces: `FactExtractor` with `extract(page: FetchedPage, topic: string): Promise<Fact[]>`. Each `Fact` carries the page's `sourceUrl`/`sourceTitle` (never invents a URL). Malformed model output yields `[]`.

- [ ] **Step 1: Write the failing test**

`src/engine/search/fact-extractor.spec.ts`:
```ts
import { FactExtractor } from './fact-extractor';

const page = { url: 'https://reuters.com/x', title: 'Reuters', text: 'GDP grew 4%.' };

describe('FactExtractor', () => {
  it('maps model claims onto the real source url/title', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ claim: 'GDP grew 4%', confidence: 0.9 }]),
        inputTokens: 5, outputTokens: 5,
      }),
    } as any;
    const ex = new FactExtractor(claude);
    const facts = await ex.extract(page, 'economy');
    expect(facts).toEqual([
      { claim: 'GDP grew 4%', sourceUrl: 'https://reuters.com/x', sourceTitle: 'Reuters', confidence: 0.9 },
    ]);
  });

  it('returns [] on non-JSON model output (no fabrication)', async () => {
    const claude = { complete: jest.fn().mockResolvedValue({ text: 'not json', inputTokens: 1, outputTokens: 1 }) } as any;
    const ex = new FactExtractor(claude);
    expect(await ex.extract(page, 'economy')).toEqual([]);
  });

  it('drops items missing a claim and clamps confidence to 0..1', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ confidence: 0.5 }, { claim: 'x', confidence: 9 }]),
        inputTokens: 1, outputTokens: 1,
      }),
    } as any;
    const ex = new FactExtractor(claude);
    const facts = await ex.extract(page, 't');
    expect(facts).toEqual([{ claim: 'x', sourceUrl: page.url, sourceTitle: page.title, confidence: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fact-extractor`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the extractor**

`src/engine/search/fact-extractor.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Fact } from '../types';
import type { FetchedPage } from './source-fetcher';
import { ClaudeClient } from '../providers/claude/claude.client';

@Injectable()
export class FactExtractor {
  constructor(private readonly claude: ClaudeClient) {}

  async extract(page: FetchedPage, topic: string): Promise<Fact[]> {
    const system =
      'You extract verifiable factual claims from a web page. ' +
      'Return ONLY a JSON array of objects {claim: string, confidence: number 0..1}. ' +
      'Use ONLY claims actually present in the text. If none, return [].';
    const user = `Topic: ${topic}\nPage text (truncated):\n${page.text.slice(0, 6000)}`;
    const { text } = await this.claude.complete({ system, user, maxTokens: 1024 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((p): p is { claim: string; confidence?: number } =>
        typeof p === 'object' && p !== null && typeof (p as { claim?: unknown }).claim === 'string')
      .map((p) => ({
        claim: p.claim,
        sourceUrl: page.url,
        sourceTitle: page.title,
        confidence: Math.max(0, Math.min(1, typeof p.confidence === 'number' ? p.confidence : 0.5)),
      }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fact-extractor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/search/fact-extractor.ts src/engine/search/fact-extractor.spec.ts
git commit -m "feat(engine): add Claude-based fact extractor (sources never fabricated)"
```

---

### Task 7: LiveSearchProvider (SearchProvider real impl) — Stage 1 assembled

> The real `SearchProvider.research`. Owned and tested by this phase. Caps the number of fetches per post (margin protection), restricts to the whitelist, records a `UsageRecord` of `kind:'search'`, and sets `hasFactualClaim=false` with zero facts when nothing trustworthy is found (no fabrication).

**Files:**
- Create: `src/engine/search/live-search.provider.ts`, `src/engine/search/live-search.provider.spec.ts`

**Interfaces:**
- Consumes: `SourceFetcher` (Task 5), `FactExtractor` (Task 6), `buildWhitelist` (Task 2), `UsageRecorder` (Task 16 — injected; in tests a stub), `SearchProvider`/`FactSet`/`BrandProfileInput` (foundation).
- Produces: `LiveSearchProvider implements SearchProvider`, `research(topic: string, brand: BrandProfileInput): Promise<FactSet>`. Reads `ENGINE_SEARCH_MAX_FETCHES` (default 5). Takes a `candidateUrlProvider(topic, whitelist): Promise<string[]>` injected callable (real impl = web search restricted to whitelist domains; mocked in tests).

- [ ] **Step 1: Write the failing test**

`src/engine/search/live-search.provider.spec.ts`:
```ts
import { LiveSearchProvider } from './live-search.provider';
import type { BrandProfileInput } from '../types';

const brand: BrandProfileInput = {
  id: 'b', tenantId: 'tn', tone: '', topics: ['economy'], prohibitions: [],
  competitors: [], keywords: [], learnedPreferences: '',
  brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
};

describe('LiveSearchProvider', () => {
  const page = { url: 'https://reuters.com/x', title: 'Reuters', text: 'GDP 4%' };

  it('fetches candidates, extracts facts, records search usage, sets hasFactualClaim=true', async () => {
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(page) } as any;
    const extractor = { extract: jest.fn().mockResolvedValue([{ claim: 'GDP 4%', sourceUrl: page.url, sourceTitle: 'Reuters', confidence: 0.9 }]) } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const candidates = jest.fn().mockResolvedValue(['https://reuters.com/x']);
    const p = new LiveSearchProvider(fetcher, extractor, usage, candidates);

    const fs = await p.research('economy', brand);
    expect(fs.hasFactualClaim).toBe(true);
    expect(fs.facts).toHaveLength(1);
    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tn', kind: 'search' }));
  });

  it('returns hasFactualClaim=false with no facts when nothing trustworthy is found', async () => {
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(null) } as any;
    const extractor = { extract: jest.fn() } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const candidates = jest.fn().mockResolvedValue(['https://evil.com/a']);
    const p = new LiveSearchProvider(fetcher, extractor, usage, candidates);

    const fs = await p.research('economy', brand);
    expect(fs).toEqual({ hasFactualClaim: false, facts: [] });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('caps fetches at ENGINE_SEARCH_MAX_FETCHES', async () => {
    process.env.ENGINE_SEARCH_MAX_FETCHES = '2';
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(page) } as any;
    const extractor = { extract: jest.fn().mockResolvedValue([]) } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const candidates = jest.fn().mockResolvedValue(['https://reuters.com/1', 'https://reuters.com/2', 'https://reuters.com/3']);
    const p = new LiveSearchProvider(fetcher, extractor, usage, candidates);

    await p.research('economy', brand);
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(2);
    delete process.env.ENGINE_SEARCH_MAX_FETCHES;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- live-search`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the provider**

`src/engine/search/live-search.provider.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { SearchProvider } from '../providers/search-provider.interface';
import type { FactSet, Fact, BrandProfileInput } from '../types';
import { SourceFetcher } from './source-fetcher';
import { FactExtractor } from './fact-extractor';
import { UsageRecorder } from '../usage/usage.recorder';
import { buildWhitelist } from '../../config/trusted-sources';

export type CandidateUrlProvider = (topic: string, whitelist: string[]) => Promise<string[]>;

@Injectable()
export class LiveSearchProvider implements SearchProvider {
  constructor(
    private readonly fetcher: SourceFetcher,
    private readonly extractor: FactExtractor,
    private readonly usage: UsageRecorder,
    private readonly candidateUrls: CandidateUrlProvider,
  ) {}

  async research(topic: string, brand: BrandProfileInput): Promise<FactSet> {
    const whitelist = buildWhitelist(brand);
    const maxFetches = Number(process.env.ENGINE_SEARCH_MAX_FETCHES ?? 5);

    const urls = (await this.candidateUrls(topic, whitelist)).slice(0, maxFetches);
    let fetches = 0;
    const facts: Fact[] = [];

    for (const url of urls) {
      if (fetches >= maxFetches) break;
      fetches += 1;
      const page = await this.fetcher.fetchPage(url, whitelist);
      if (!page) continue;
      const extracted = await this.extractor.extract(page, topic);
      facts.push(...extracted);
    }

    await this.usage.record({ tenantId: brand.tenantId, kind: 'search', units: fetches, costUsd: 0 });

    return facts.length > 0
      ? { hasFactualClaim: true, facts }
      : { hasFactualClaim: false, facts: [] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- live-search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/search/live-search.provider.ts src/engine/search/live-search.provider.spec.ts
git commit -m "feat(engine): add LiveSearchProvider (restricted search, usage, no fabrication)"
```

---

### Task 8: UsageRecorder + quota check

> One place that writes `UsageRecord` rows and answers "is this tenant over its cap?". The quota check is what lets the month-plan distinguish `skipped_quota` from `provider_error`.

**Files:**
- Create: `src/engine/usage/usage.recorder.ts`, `src/engine/usage/usage.recorder.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (foundation).
- Produces: `UsageRecorder` with `record(input: { tenantId: string; kind: 'text' | 'image' | 'search'; units: number; costUsd: number; subscriptionId?: string }): Promise<void>` and `isOverQuota(tenantId: string): Promise<boolean>` (true when total `units` this period ≥ `ENGINE_MONTHLY_UNIT_CAP`, default 100000).

- [ ] **Step 1: Write the failing test**

`src/engine/usage/usage.recorder.spec.ts`:
```ts
import { UsageRecorder } from './usage.recorder';

describe('UsageRecorder', () => {
  it('writes a UsageRecord row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { usageRecord: { create, aggregate: jest.fn() } } as any;
    const rec = new UsageRecorder(prisma);
    await rec.record({ tenantId: 'tn', kind: 'text', units: 3, costUsd: 0.02 });
    expect(create).toHaveBeenCalledWith({
      data: { tenantId: 'tn', kind: 'text', units: 3, costUsd: 0.02, subscriptionId: undefined },
    });
  });

  it('isOverQuota is true at or above the cap', async () => {
    process.env.ENGINE_MONTHLY_UNIT_CAP = '10';
    const aggregate = jest.fn().mockResolvedValue({ _sum: { units: 10 } });
    const prisma = { usageRecord: { create: jest.fn(), aggregate } } as any;
    const rec = new UsageRecorder(prisma);
    expect(await rec.isOverQuota('tn')).toBe(true);
    delete process.env.ENGINE_MONTHLY_UNIT_CAP;
  });

  it('isOverQuota is false below the cap and treats null sum as 0', async () => {
    process.env.ENGINE_MONTHLY_UNIT_CAP = '10';
    const aggregate = jest.fn().mockResolvedValue({ _sum: { units: null } });
    const prisma = { usageRecord: { create: jest.fn(), aggregate } } as any;
    const rec = new UsageRecorder(prisma);
    expect(await rec.isOverQuota('tn')).toBe(false);
    delete process.env.ENGINE_MONTHLY_UNIT_CAP;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- usage.recorder`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the recorder**

`src/engine/usage/usage.recorder.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UsageInput {
  tenantId: string;
  kind: 'text' | 'image' | 'search';
  units: number;
  costUsd: number;
  subscriptionId?: string;
}

@Injectable()
export class UsageRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: UsageInput): Promise<void> {
    await this.prisma.usageRecord.create({
      data: {
        tenantId: input.tenantId,
        kind: input.kind,
        units: input.units,
        costUsd: input.costUsd,
        subscriptionId: input.subscriptionId,
      },
    });
  }

  async isOverQuota(tenantId: string): Promise<boolean> {
    const cap = Number(process.env.ENGINE_MONTHLY_UNIT_CAP ?? 100000);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const agg = await this.prisma.usageRecord.aggregate({
      _sum: { units: true },
      where: { tenantId, createdAt: { gte: startOfMonth } },
    });
    return (agg._sum.units ?? 0) >= cap;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- usage.recorder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/usage/usage.recorder.ts src/engine/usage/usage.recorder.spec.ts
git commit -m "feat(engine): add UsageRecorder with monthly quota check"
```

---

### Task 9: Rubric builder (Stage 3 input from BrandProfile + limits + prohibitions)

**Files:**
- Create: `src/engine/draft/rubric.builder.ts`, `src/engine/draft/rubric.builder.spec.ts`

**Interfaces:**
- Consumes: `Rubric` (foundation), `BrandProfileInput`, `Platform`.
- Produces: `buildRubric(brand: BrandProfileInput, platform: Platform): Rubric` — sets all five rubric checks to the criteria the critique must enforce. (The booleans are the *required* outcomes the critique evaluates against; all true means "this is what passing looks like".)

- [ ] **Step 1: Write the failing test**

`src/engine/draft/rubric.builder.spec.ts`:
```ts
import { buildRubric } from './rubric.builder';
import type { BrandProfileInput } from '../types';

const brand: BrandProfileInput = {
  id: 'b', tenantId: 'tn', tone: 'professional', topics: ['x'], prohibitions: ['no slang'],
  competitors: [], keywords: [], learnedPreferences: '',
  brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
};

describe('buildRubric', () => {
  it('requires all five criteria to pass', () => {
    expect(buildRubric(brand, 'linkedin')).toEqual({
      toneMatch: true,
      sourceIntegrity: true,
      platformCompliance: true,
      prohibitions: true,
      clarity: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rubric.builder`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the builder**

`src/engine/draft/rubric.builder.ts`:
```ts
import type { Rubric, BrandProfileInput } from '../types';
import type { Platform } from '../../config/platform-limits';

// The rubric encodes the required passing outcome for each dimension.
// brand + platform are used by the critique prompt (Task 10) to make each check concrete.
export function buildRubric(_brand: BrandProfileInput, _platform: Platform): Rubric {
  return {
    toneMatch: true,
    sourceIntegrity: true,
    platformCompliance: true,
    prohibitions: true,
    clarity: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rubric.builder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/draft/rubric.builder.ts src/engine/draft/rubric.builder.spec.ts
git commit -m "feat(engine): add rubric builder for critique stage"
```

---

### Task 10: ClaudeContentProvider (ContentProvider real impl — draft + critique)

> Implements the `ContentProvider` seam with real Claude prompts. `draft` weaves facts and pairs every factual claim with its source (empty `citations` when `factSet.hasFactualClaim===false`). `critique` scores the draft against the rubric. Both go through `ClaudeClient` only.

**Files:**
- Create: `src/engine/providers/claude/claude-content.provider.ts`, `src/engine/providers/claude/claude-content.provider.spec.ts`

**Interfaces:**
- Consumes: `ClaudeClient` (Task 4), `ContentProvider`/`DraftInput` (foundation), `Draft`/`Rubric`/`CritiqueResult`.
- Produces: `ClaudeContentProvider implements ContentProvider` — `draft(input: DraftInput): Promise<Draft>`, `critique(draft: Draft, rubric: Rubric): Promise<CritiqueResult>`. Exposes the last call's token usage via `lastUsage: { inputTokens: number; outputTokens: number }` so the stage wrapper can record it.

- [ ] **Step 1: Write the failing test**

`src/engine/providers/claude/claude-content.provider.spec.ts`:
```ts
import { ClaudeContentProvider } from './claude-content.provider';
import type { DraftInput } from '../content-provider.interface';
import type { FactSet, Draft, Rubric } from '../../types';

const factSet: FactSet = {
  hasFactualClaim: true,
  facts: [{ claim: 'GDP 4%', sourceUrl: 'https://reuters.com/x', sourceTitle: 'R', confidence: 0.9 }],
};
const input: DraftInput = {
  factSet,
  brand: { id: 'b', tenantId: 'tn', tone: 'pro', topics: ['eco'], prohibitions: [], competitors: [], keywords: [], learnedPreferences: '', brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' } },
  platform: 'linkedin',
  contentType: 'informational',
};

describe('ClaudeContentProvider', () => {
  it('draft parses model JSON into a Draft and exposes token usage', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({ text: 'النمو ٤٪', citations: [{ claim: 'GDP 4%', sourceUrl: 'https://reuters.com/x' }], hashtags: ['#اقتصاد'], imageBrief: 'chart' }),
        inputTokens: 20, outputTokens: 30,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const d = await p.draft(input);
    expect(d.text).toBe('النمو ٤٪');
    expect(d.citations).toEqual([{ claim: 'GDP 4%', sourceUrl: 'https://reuters.com/x' }]);
    expect(p.lastUsage).toEqual({ inputTokens: 20, outputTokens: 30 });
  });

  it('draft returns empty citations when there is no factual claim', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({ text: 'رأي', citations: [{ claim: 'x', sourceUrl: 'https://made-up.com' }], hashtags: [], imageBrief: '' }),
        inputTokens: 1, outputTokens: 1,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const d = await p.draft({ ...input, factSet: { hasFactualClaim: false, facts: [] } });
    expect(d.citations).toEqual([]); // fabricated citation stripped
  });

  it('critique parses score/passed/issues', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({ score: 0.6, passed: false, issues: ['tone too casual'] }),
        inputTokens: 5, outputTokens: 5,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const draft: Draft = { text: 't', citations: [], hashtags: [], imageBrief: '' };
    const rubric: Rubric = { toneMatch: true, sourceIntegrity: true, platformCompliance: true, prohibitions: true, clarity: true };
    const r = await p.critique(draft, rubric);
    expect(r).toEqual({ score: 0.6, passed: false, issues: ['tone too casual'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- claude-content`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the provider**

`src/engine/providers/claude/claude-content.provider.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { ContentProvider, DraftInput } from '../content-provider.interface';
import type { Draft, Rubric, CritiqueResult } from '../../types';
import { ClaudeClient } from './claude.client';

@Injectable()
export class ClaudeContentProvider implements ContentProvider {
  public lastUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(private readonly claude: ClaudeClient) {}

  async draft(input: DraftInput): Promise<Draft> {
    const factLines = input.factSet.hasFactualClaim
      ? input.factSet.facts.map((f) => `- "${f.claim}" (source: ${f.sourceUrl})`).join('\n')
      : '(no trusted source found — write as opinion/tone, make NO factual claim, add NO citation)';

    const system =
      'You are an Arabic brand copywriter. Write a social post in the brand tone. ' +
      'Pair EVERY factual claim with its exact source URL from the provided facts. ' +
      'NEVER invent a source. If no facts are provided, write opinion/tone with empty citations. ' +
      'Return ONLY JSON: {text, citations:[{claim,sourceUrl}], hashtags:[], imageBrief}.';
    const user =
      `Platform: ${input.platform}\nContent type: ${input.contentType}\n` +
      `Tone: ${input.brand.tone}\nAudience: ${input.brand.audience ?? ''}\n` +
      `Prohibitions: ${input.brand.prohibitions.join(', ')}\n` +
      `Learned preferences: ${input.brand.learnedPreferences}\n` +
      `${input.brief ? `Brief: ${input.brief}\n` : ''}` +
      `Facts:\n${factLines}`;

    const res = await this.claude.complete({ system, user, maxTokens: 2048 });
    this.lastUsage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };

    const parsed = JSON.parse(res.text) as Draft;
    const citations = input.factSet.hasFactualClaim ? parsed.citations ?? [] : [];
    return {
      text: parsed.text ?? '',
      citations,
      hashtags: parsed.hashtags ?? [],
      imageBrief: parsed.imageBrief ?? '',
    };
  }

  async critique(draft: Draft, rubric: Rubric): Promise<CritiqueResult> {
    const system =
      'You critique an Arabic social post against a rubric. ' +
      'Return ONLY JSON {score: 0..1, passed: boolean, issues: string[]}. ' +
      'passed=true only if tone, source integrity, platform compliance, prohibitions, and clarity all hold.';
    const user = `Rubric (all must hold): ${JSON.stringify(rubric)}\nPost: ${JSON.stringify(draft)}`;
    const res = await this.claude.complete({ system, user, maxTokens: 1024 });
    this.lastUsage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };

    const parsed = JSON.parse(res.text) as CritiqueResult;
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      passed: parsed.passed === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- claude-content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/providers/claude/claude-content.provider.ts src/engine/providers/claude/claude-content.provider.spec.ts
git commit -m "feat(engine): add ClaudeContentProvider (draft + critique behind seam)"
```

---

### Task 11: Draft stage (Stage 2 unit — calls ContentProvider.draft + records usage)

**Files:**
- Create: `src/engine/draft/draft.stage.ts`, `src/engine/draft/draft.stage.spec.ts`

**Interfaces:**
- Consumes: `ClaudeContentProvider` (Task 10), `UsageRecorder` (Task 8), `DraftInput`, `Draft`.
- Produces: `DraftStage` with `run(input: DraftInput): Promise<Draft>` — calls the provider, records a `kind:'text'` `UsageRecord` using the provider's `lastUsage` (units = input+output tokens).

- [ ] **Step 1: Write the failing test**

`src/engine/draft/draft.stage.spec.ts`:
```ts
import { DraftStage } from './draft.stage';
import type { DraftInput } from '../providers/content-provider.interface';

const input: DraftInput = {
  factSet: { hasFactualClaim: false, facts: [] },
  brand: { id: 'b', tenantId: 'tn', tone: '', topics: [], prohibitions: [], competitors: [], keywords: [], learnedPreferences: '', brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' } },
  platform: 'x',
  contentType: 'thought',
};

describe('DraftStage', () => {
  it('drafts and records text usage with token units', async () => {
    const provider = {
      draft: jest.fn().mockResolvedValue({ text: 't', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 12, outputTokens: 8 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new DraftStage(provider, usage);
    const d = await stage.run(input);
    expect(d.text).toBe('t');
    expect(usage.record).toHaveBeenCalledWith({ tenantId: 'tn', kind: 'text', units: 20, costUsd: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- draft.stage`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the stage**

`src/engine/draft/draft.stage.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Draft } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { ClaudeContentProvider } from '../providers/claude/claude-content.provider';
import { UsageRecorder } from '../usage/usage.recorder';

@Injectable()
export class DraftStage {
  constructor(
    private readonly provider: ClaudeContentProvider,
    private readonly usage: UsageRecorder,
  ) {}

  async run(input: DraftInput): Promise<Draft> {
    const draft = await this.provider.draft(input);
    const { inputTokens, outputTokens } = this.provider.lastUsage;
    await this.usage.record({
      tenantId: input.brand.tenantId,
      kind: 'text',
      units: inputTokens + outputTokens,
      costUsd: 0,
    });
    return draft;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- draft.stage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/draft/draft.stage.ts src/engine/draft/draft.stage.spec.ts
git commit -m "feat(engine): add draft stage with usage recording"
```

---

### Task 12: Critique stage (Stage 3 — quality loop, max 3 rounds, best version + issues)

> Re-drafts and re-critiques until `passed` or the 3-round cap. On cap, returns the highest-scoring draft seen plus that critique's `issues` (visible to the customer). Each critique + redraft records text usage.

**Files:**
- Create: `src/engine/draft/critique.stage.ts`, `src/engine/draft/critique.stage.spec.ts`

**Interfaces:**
- Consumes: `ClaudeContentProvider` (Task 10), `UsageRecorder` (Task 8), `buildRubric` (Task 9), `Draft`, `CritiqueResult`, `DraftInput`.
- Produces: `CritiqueStage` with `run(draft: Draft, input: DraftInput): Promise<{ draft: Draft; issues: string[] }>`. Reads `ENGINE_CRITIQUE_MAX_ROUNDS` (default 3, clamped 2..3).

- [ ] **Step 1: Write the failing test**

`src/engine/draft/critique.stage.spec.ts`:
```ts
import { CritiqueStage } from './critique.stage';
import type { DraftInput } from '../providers/content-provider.interface';
import type { Draft } from '../types';

const input: DraftInput = {
  factSet: { hasFactualClaim: false, facts: [] },
  brand: { id: 'b', tenantId: 'tn', tone: '', topics: [], prohibitions: [], competitors: [], keywords: [], learnedPreferences: '', brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' } },
  platform: 'linkedin',
  contentType: 'informational',
};
const d0: Draft = { text: 'v0', citations: [], hashtags: [], imageBrief: '' };

describe('CritiqueStage', () => {
  it('returns immediately with no issues when first critique passes', async () => {
    const provider = {
      critique: jest.fn().mockResolvedValue({ score: 0.9, passed: true, issues: [] }),
      draft: jest.fn(),
      lastUsage: { inputTokens: 1, outputTokens: 1 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new CritiqueStage(provider, usage);
    const res = await stage.run(d0, input);
    expect(res).toEqual({ draft: d0, issues: [] });
    expect(provider.draft).not.toHaveBeenCalled();
  });

  it('redrafts then passes on round 2', async () => {
    const provider = {
      critique: jest.fn()
        .mockResolvedValueOnce({ score: 0.4, passed: false, issues: ['fix tone'] })
        .mockResolvedValueOnce({ score: 0.95, passed: true, issues: [] }),
      draft: jest.fn().mockResolvedValue({ text: 'v1', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 1, outputTokens: 1 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new CritiqueStage(provider, usage);
    const res = await stage.run(d0, input);
    expect(res.draft.text).toBe('v1');
    expect(res.issues).toEqual([]);
  });

  it('after the cap returns the best-scoring draft with its issues', async () => {
    process.env.ENGINE_CRITIQUE_MAX_ROUNDS = '3';
    const provider = {
      critique: jest.fn()
        .mockResolvedValueOnce({ score: 0.5, passed: false, issues: ['a'] })   // for d0
        .mockResolvedValueOnce({ score: 0.7, passed: false, issues: ['b'] })   // for v1 (best)
        .mockResolvedValueOnce({ score: 0.6, passed: false, issues: ['c'] }),  // for v2
      draft: jest.fn()
        .mockResolvedValueOnce({ text: 'v1', citations: [], hashtags: [], imageBrief: '' })
        .mockResolvedValueOnce({ text: 'v2', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 1, outputTokens: 1 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new CritiqueStage(provider, usage);
    const res = await stage.run(d0, input);
    expect(res.draft.text).toBe('v1');     // highest score 0.7
    expect(res.issues).toEqual(['b']);     // issues of the best version
    delete process.env.ENGINE_CRITIQUE_MAX_ROUNDS;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- critique.stage`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the stage**

`src/engine/draft/critique.stage.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Draft, CritiqueResult } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { ClaudeContentProvider } from '../providers/claude/claude-content.provider';
import { UsageRecorder } from '../usage/usage.recorder';
import { buildRubric } from './rubric.builder';

@Injectable()
export class CritiqueStage {
  constructor(
    private readonly provider: ClaudeContentProvider,
    private readonly usage: UsageRecorder,
  ) {}

  async run(initial: Draft, input: DraftInput): Promise<{ draft: Draft; issues: string[] }> {
    const rubric = buildRubric(input.brand, input.platform);
    const maxRounds = Math.min(3, Math.max(2, Number(process.env.ENGINE_CRITIQUE_MAX_ROUNDS ?? 3)));

    let current = initial;
    let best: { draft: Draft; result: CritiqueResult } | null = null;

    for (let round = 0; round < maxRounds; round += 1) {
      const result = await this.provider.critique(current, rubric);
      await this.recordUsage(input.brand.tenantId);

      if (result.passed) return { draft: current, issues: [] };
      if (best === null || result.score > best.result.score) best = { draft: current, result };

      if (round < maxRounds - 1) {
        current = await this.provider.draft(input);
        await this.recordUsage(input.brand.tenantId);
      }
    }

    return { draft: best!.draft, issues: best!.result.issues };
  }

  private async recordUsage(tenantId: string): Promise<void> {
    const { inputTokens, outputTokens } = this.provider.lastUsage;
    await this.usage.record({ tenantId, kind: 'text', units: inputTokens + outputTokens, costUsd: 0 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- critique.stage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/draft/critique.stage.ts src/engine/draft/critique.stage.spec.ts
git commit -m "feat(engine): add critique stage with capped quality loop"
```

---

### Task 13: Image storage service (MinIO upload)

**Files:**
- Create: `src/engine/storage/image-storage.service.ts`, `src/engine/storage/image-storage.service.spec.ts`
- Modify: `package.json` (add `minio`)

**Interfaces:**
- Consumes: `ConfigService` (MinIO env from foundation `.env.example`).
- Produces: `ImageStorageService` with `upload(bytes: Buffer, key: string): Promise<string>` — puts the object into `MINIO_BUCKET` and returns its public URL.

- [ ] **Step 1: Install the client**

```bash
npm i minio
```

- [ ] **Step 2: Write the failing test (client mocked)**

`src/engine/storage/image-storage.service.spec.ts`:
```ts
import { ImageStorageService } from './image-storage.service';

const putObject = jest.fn();
jest.mock('minio', () => ({ Client: jest.fn().mockImplementation(() => ({ putObject: (...a: unknown[]) => putObject(...a) })) }));

const config = {
  get: (k: string) => ({
    MINIO_ENDPOINT: 'localhost', MINIO_PORT: '9000', MINIO_ACCESS_KEY: 'a',
    MINIO_SECRET_KEY: 's', MINIO_BUCKET: 'athar-images',
  }[k]),
} as any;

describe('ImageStorageService', () => {
  beforeEach(() => putObject.mockReset());

  it('uploads bytes and returns the object url', async () => {
    putObject.mockResolvedValue({});
    const svc = new ImageStorageService(config);
    const url = await svc.upload(Buffer.from('x'), 'posts/1.png');
    expect(putObject).toHaveBeenCalledWith('athar-images', 'posts/1.png', expect.any(Buffer), expect.any(Number), { 'Content-Type': 'image/png' });
    expect(url).toContain('athar-images/posts/1.png');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- image-storage`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement the service**

`src/engine/storage/image-storage.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class ImageStorageService {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly port: number;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('MINIO_ENDPOINT')!;
    this.port = Number(config.get<string>('MINIO_PORT'));
    this.bucket = config.get<string>('MINIO_BUCKET')!;
    this.client = new Client({
      endPoint: this.endpoint,
      port: this.port,
      useSSL: false,
      accessKey: config.get<string>('MINIO_ACCESS_KEY')!,
      secretKey: config.get<string>('MINIO_SECRET_KEY')!,
    });
  }

  async upload(bytes: Buffer, key: string): Promise<string> {
    await this.client.putObject(this.bucket, key, bytes, bytes.length, { 'Content-Type': 'image/png' });
    return `http://${this.endpoint}:${this.port}/${this.bucket}/${key}`;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- image-storage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/storage package.json package-lock.json
git commit -m "feat(engine): add MinIO image storage service"
```

---

### Task 14: OpenAI image client + VisionVerifier (thin wrappers — only files importing openai)

**Files:**
- Create: `src/engine/providers/openai/openai-image.client.ts`, `src/engine/providers/openai/openai-image.client.spec.ts`
- Create: `src/engine/providers/openai/vision-verifier.ts`, `src/engine/providers/openai/vision-verifier.spec.ts`
- Modify: `package.json` (add `openai`)

**Interfaces:**
- Consumes: `ConfigService` (`OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_VISION_MODEL`), `isArabicTextBroken`/`normalizeArabic` (Task 1).
- Produces: `OpenAiImageClient.generate(prompt: string, size: string): Promise<Buffer>` (throws `EngineError(..,'provider_error')` on failure); `VisionVerifier.verify(bytes: Buffer, intendedText: string): Promise<{ verifiedText: string; matches: boolean }>`.

- [ ] **Step 1: Install the SDK**

```bash
npm i openai
```

- [ ] **Step 2: Write the failing tests**

`src/engine/providers/openai/openai-image.client.spec.ts`:
```ts
import { OpenAiImageClient } from './openai-image.client';
import { EngineError } from '../../types';

const generate = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ images: { generate: (...a: unknown[]) => generate(...a) } })));

const config = { get: (k: string) => ({ OPENAI_API_KEY: 'k', OPENAI_IMAGE_MODEL: 'img-model' }[k]) } as any;

describe('OpenAiImageClient', () => {
  beforeEach(() => generate.mockReset());

  it('returns image bytes from base64', async () => {
    generate.mockResolvedValue({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
    const c = new OpenAiImageClient(config);
    const buf = await c.generate('prompt', '1200x1200');
    expect(buf.toString()).toBe('png');
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'img-model', size: '1200x1200' }));
  });

  it('wraps failures as provider_error', async () => {
    generate.mockRejectedValue(new Error('429'));
    const c = new OpenAiImageClient(config);
    await expect(c.generate('p', '1200x1200')).rejects.toBeInstanceOf(EngineError);
  });
});
```

`src/engine/providers/openai/vision-verifier.spec.ts`:
```ts
import { VisionVerifier } from './vision-verifier';

const create = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: (...a: unknown[]) => create(...a) } } })));

const config = { get: (k: string) => ({ OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'vision' }[k]) } as any;

describe('VisionVerifier', () => {
  beforeEach(() => create.mockReset());

  it('matches when the read-back text equals intended', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ابدأ الآن' } }] });
    const v = new VisionVerifier(config);
    expect(await v.verify(Buffer.from('x'), 'ابدأ الآن')).toEqual({ verifiedText: 'ابدأ الآن', matches: true });
  });

  it('does not match when text is broken', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'اىدأ الان zz' } }] });
    const v = new VisionVerifier(config);
    const r = await v.verify(Buffer.from('x'), 'ابدأ الآن');
    expect(r.matches).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- openai-image.client && npm test -- vision-verifier`
Expected: FAIL — cannot find modules.

- [ ] **Step 4: Implement both wrappers**

`src/engine/providers/openai/openai-image.client.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EngineError } from '../../types';

@Injectable()
export class OpenAiImageClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.model = config.get<string>('OPENAI_IMAGE_MODEL')!;
  }

  async generate(prompt: string, size: string): Promise<Buffer> {
    try {
      const res = await this.client.images.generate({ model: this.model, prompt, size });
      return Buffer.from(res.data[0].b64_json!, 'base64');
    } catch (err) {
      throw new EngineError(`gpt-image call failed: ${(err as Error).message}`, 'provider_error');
    }
  }
}
```

`src/engine/providers/openai/vision-verifier.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { isArabicTextBroken } from '../../../../test/image-gate/run-gate';

@Injectable()
export class VisionVerifier {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.model = config.get<string>('OPENAI_VISION_MODEL')!;
  }

  async verify(bytes: Buffer, intendedText: string): Promise<{ verifiedText: string; matches: boolean }> {
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe ONLY the Arabic text visible in this image, verbatim. Output just the text.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    const verifiedText = (res.choices[0].message.content ?? '').trim();
    return { verifiedText, matches: !isArabicTextBroken(intendedText, verifiedText) };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- openai-image.client && npm test -- vision-verifier`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/providers/openai/openai-image.client.ts src/engine/providers/openai/openai-image.client.spec.ts src/engine/providers/openai/vision-verifier.ts src/engine/providers/openai/vision-verifier.spec.ts package.json package-lock.json
git commit -m "feat(engine): add OpenAI image client and vision verifier"
```

---

### Task 15: OverlayRenderer (Satori + Sharp fallback, kit.font)

> Programmatic text overlay used when gpt-image's text is broken (or when the gate made overlay primary). Renders the Arabic text over a background with `kit.font` (default IBM Plex Sans Arabic).

**Files:**
- Create: `src/engine/providers/openai/overlay-renderer.ts`, `src/engine/providers/openai/overlay-renderer.spec.ts`
- Modify: `package.json` (add `satori`, `sharp`)

**Interfaces:**
- Consumes: `BrandKit` (foundation).
- Produces: `OverlayRenderer.render(background: Buffer, text: string, kit: BrandKit, size: [number, number]): Promise<Buffer>` — composites `text` (centered, `kit.font`) onto `background`, returns PNG bytes.

- [ ] **Step 1: Install deps**

```bash
npm i satori sharp
```

- [ ] **Step 2: Write the failing test (satori + sharp mocked)**

`src/engine/providers/openai/overlay-renderer.spec.ts`:
```ts
import { OverlayRenderer } from './overlay-renderer';
import type { BrandKit } from '../../types';

const satoriMock = jest.fn();
jest.mock('satori', () => ({ __esModule: true, default: (...a: unknown[]) => satoriMock(...a) }));

const composite = jest.fn().mockReturnThis();
const png = jest.fn().mockReturnThis();
const toBuffer = jest.fn().mockResolvedValue(Buffer.from('result-png'));
jest.mock('sharp', () => jest.fn().mockImplementation(() => ({ composite, png, toBuffer })));

const kit: BrandKit = { colors: ['#0a0a0a'], visualStyle: 'clean', font: 'IBM Plex Sans Arabic' };

describe('OverlayRenderer', () => {
  beforeEach(() => { satoriMock.mockReset(); composite.mockClear(); });

  it('renders svg via satori and composites it over the background', async () => {
    satoriMock.mockResolvedValue('<svg>text</svg>');
    const r = new OverlayRenderer(async () => Buffer.from('font-bytes'));
    const out = await r.render(Buffer.from('bg'), 'ابدأ الآن', kit, [1200, 1200]);
    expect(satoriMock).toHaveBeenCalled();
    expect(composite).toHaveBeenCalled();
    expect(out.toString()).toBe('result-png');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- overlay-renderer`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement the renderer**

`src/engine/providers/openai/overlay-renderer.ts`:
```ts
import { Injectable } from '@nestjs/common';
import satori from 'satori';
import sharp from 'sharp';
import type { BrandKit } from '../../types';
import { readFile } from 'node:fs/promises';

export type FontLoader = (font: string) => Promise<Buffer>;

const defaultFontLoader: FontLoader = async () => {
  // Bundled IBM Plex Sans Arabic regular; path set up at deploy time.
  return readFile(process.env.OVERLAY_FONT_PATH ?? './assets/fonts/IBMPlexSansArabic-Regular.ttf');
};

@Injectable()
export class OverlayRenderer {
  constructor(private readonly fontLoader: FontLoader = defaultFontLoader) {}

  async render(background: Buffer, text: string, kit: BrandKit, size: [number, number]): Promise<Buffer> {
    const [width, height] = size;
    const fontData = await this.fontLoader(kit.font);
    const color = kit.colors[0] ?? '#ffffff';

    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 80, textAlign: 'center', direction: 'rtl', color,
            fontFamily: kit.font, fontSize: 64, fontWeight: 700,
          },
          children: text,
        },
      },
      { width, height, fonts: [{ name: kit.font, data: fontData, weight: 700, style: 'normal' }] },
    );

    const overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();
    return sharp(background)
      .resize(width, height, { fit: 'cover' })
      .composite([{ input: overlayPng }])
      .png()
      .toBuffer();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- overlay-renderer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/providers/openai/overlay-renderer.ts src/engine/providers/openai/overlay-renderer.spec.ts package.json package-lock.json
git commit -m "feat(engine): add Satori/Sharp overlay renderer for Arabic text fallback"
```

---

### Task 16: GptImageProvider (ImageProvider real impl — gate-driven, verify loop, overlay fallback)

> The `ImageProvider` seam, wired to the gate decision. When the gate primary is `gpt-image`: generate with text → verify → regenerate up to `gptImageMaxAttempts` → on persistent breakage, overlay fallback. When the gate primary is `overlay`: generate a background-only image then overlay the text. Records an `image` `UsageRecord` per generation attempt. Sets `method` and `attempts` on the returned `ImageAsset`.

**Files:**
- Create: `src/engine/providers/openai/gpt-image.provider.ts`, `src/engine/providers/openai/gpt-image.provider.spec.ts`

**Interfaces:**
- Consumes: `OpenAiImageClient` (Task 14), `VisionVerifier` (Task 14), `OverlayRenderer` (Task 15), `ImageStorageService` (Task 13), `UsageRecorder` (Task 8), `IMAGE_GATE_DECISION` (Task 1), `getLimit` (foundation platform-limits), `BrandKit`/`ImageAsset`/`Platform`.
- Produces: `GptImageProvider implements ImageProvider` — `generateImage(brief: string, kit: BrandKit, platform: Platform): Promise<ImageAsset>`. NOTE the seam signature lacks `tenantId`; the provider records usage under `kit`-independent tenant via an injected `tenantId` set per-call through `setTenant(tenantId)` (called by the pipeline before each image). `verifiedText` on the asset = the confirmed text (or the intended text when overlay is used).

- [ ] **Step 1: Write the failing test**

`src/engine/providers/openai/gpt-image.provider.spec.ts`:
```ts
import { GptImageProvider } from './gpt-image.provider';
import type { BrandKit } from '../../types';

jest.mock('../../image/image-gate.config', () => ({ IMAGE_GATE_DECISION: { primaryMethod: 'gpt-image', gptImageMaxAttempts: 3 } }));

const kit: BrandKit = { colors: ['#000'], visualStyle: 'clean', font: 'IBM Plex Sans Arabic' };

function deps(over: Partial<Record<string, unknown>> = {}) {
  return {
    imageClient: { generate: jest.fn().mockResolvedValue(Buffer.from('img')) },
    verifier: { verify: jest.fn() },
    overlay: { render: jest.fn().mockResolvedValue(Buffer.from('overlaid')) },
    storage: { upload: jest.fn().mockResolvedValue('http://minio/athar-images/p.png') },
    usage: { record: jest.fn().mockResolvedValue(undefined) },
    ...over,
  };
}

describe('GptImageProvider', () => {
  it('returns gpt-image method on first verify success', async () => {
    const d = deps();
    (d.verifier.verify as jest.Mock).mockResolvedValue({ verifiedText: 'ابدأ', matches: true });
    const p = new GptImageProvider(d.imageClient as any, d.verifier as any, d.overlay as any, d.storage as any, d.usage as any);
    p.setTenant('tn');
    const asset = await p.generateImage('ابدأ', kit, 'linkedin');
    expect(asset).toEqual({ url: 'http://minio/athar-images/p.png', verifiedText: 'ابدأ', method: 'gpt-image', attempts: 1 });
    expect(d.usage.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tn', kind: 'image' }));
  });

  it('falls back to overlay after attempts exhausted', async () => {
    const d = deps();
    (d.verifier.verify as jest.Mock).mockResolvedValue({ verifiedText: 'broken', matches: false });
    const p = new GptImageProvider(d.imageClient as any, d.verifier as any, d.overlay as any, d.storage as any, d.usage as any);
    p.setTenant('tn');
    const asset = await p.generateImage('ابدأ', kit, 'x');
    expect(asset.method).toBe('overlay-fallback');
    expect(asset.verifiedText).toBe('ابدأ');         // intended text used for overlay
    expect(asset.attempts).toBe(3);
    expect(d.overlay.render).toHaveBeenCalled();
  });

  it('overlay-primary gate path skips verification and overlays directly', async () => {
    jest.resetModules();
    jest.doMock('../../image/image-gate.config', () => ({ IMAGE_GATE_DECISION: { primaryMethod: 'overlay', gptImageMaxAttempts: 0 } }));
    const { GptImageProvider: OverlayPrimary } = require('./gpt-image.provider');
    const d = deps();
    const p = new OverlayPrimary(d.imageClient as any, d.verifier as any, d.overlay as any, d.storage as any, d.usage as any);
    p.setTenant('tn');
    const asset = await p.generateImage('ابدأ', kit, 'linkedin');
    expect(asset.method).toBe('overlay-fallback');
    expect(d.verifier.verify).not.toHaveBeenCalled();
    expect(asset.attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gpt-image.provider`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the provider**

`src/engine/providers/openai/gpt-image.provider.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { ImageProvider } from '../image-provider.interface';
import type { BrandKit, ImageAsset } from '../../types';
import type { Platform } from '../../../config/platform-limits';
import { getLimit } from '../../../config/platform-limits';
import { OpenAiImageClient } from './openai-image.client';
import { VisionVerifier } from './vision-verifier';
import { OverlayRenderer } from './overlay-renderer';
import { ImageStorageService } from '../../storage/image-storage.service';
import { UsageRecorder } from '../../usage/usage.recorder';
import { IMAGE_GATE_DECISION } from '../../image/image-gate.config';

@Injectable()
export class GptImageProvider implements ImageProvider {
  private tenantId = 'unknown';

  constructor(
    private readonly imageClient: OpenAiImageClient,
    private readonly verifier: VisionVerifier,
    private readonly overlay: OverlayRenderer,
    private readonly storage: ImageStorageService,
    private readonly usage: UsageRecorder,
  ) {}

  setTenant(tenantId: string): void {
    this.tenantId = tenantId;
  }

  async generateImage(brief: string, kit: BrandKit, platform: Platform): Promise<ImageAsset> {
    const size = getLimit(platform).images.defaultSize; // [1200,1200] safe square
    const sizeStr = `${size[0]}x${size[1]}`;
    const key = `posts/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

    if (IMAGE_GATE_DECISION.primaryMethod === 'overlay') {
      const bg = await this.imageClient.generate(this.backgroundPrompt(brief, kit), sizeStr);
      await this.recordImageUsage();
      const composited = await this.overlay.render(bg, brief, kit, size);
      const url = await this.storage.upload(composited, key);
      return { url, verifiedText: brief, method: 'overlay-fallback', attempts: 1 };
    }

    let attempts = 0;
    const maxAttempts = IMAGE_GATE_DECISION.gptImageMaxAttempts;
    let lastBytes: Buffer = Buffer.alloc(0);

    while (attempts < maxAttempts) {
      attempts += 1;
      lastBytes = await this.imageClient.generate(this.textPrompt(brief, kit), sizeStr);
      await this.recordImageUsage();
      const { verifiedText, matches } = await this.verifier.verify(lastBytes, brief);
      if (matches) {
        const url = await this.storage.upload(lastBytes, key);
        return { url, verifiedText, method: 'gpt-image', attempts };
      }
    }

    // Persistent breakage -> overlay fallback over the last background.
    const composited = await this.overlay.render(lastBytes, brief, kit, size);
    const url = await this.storage.upload(composited, key);
    return { url, verifiedText: brief, method: 'overlay-fallback', attempts };
  }

  private textPrompt(brief: string, kit: BrandKit): string {
    return `${kit.visualStyle}. Brand colors ${kit.colors.join(', ')}. ` +
      `Render this Arabic text accurately, large and centered: "${brief}". Keep key elements in the center.`;
  }

  private backgroundPrompt(brief: string, kit: BrandKit): string {
    return `${kit.visualStyle}. Brand colors ${kit.colors.join(', ')}. ` +
      `A background image (NO text) suitable for: "${brief}". Leave the center clear for an overlaid title.`;
  }

  private async recordImageUsage(): Promise<void> {
    await this.usage.record({ tenantId: this.tenantId, kind: 'image', units: 1, costUsd: 0 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gpt-image.provider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/providers/openai/gpt-image.provider.ts src/engine/providers/openai/gpt-image.provider.spec.ts
git commit -m "feat(engine): add GptImageProvider with gate-driven verify/overlay path"
```

---

### Task 17: Platform formatter (apply platform-limits — twitter-text, hashtags, links, hook)

> Stage 5 part A. Validates and shapes the draft text against `platform-limits` (doc 15): X uses weighted counting via `twitter-text` (280 free), LinkedIn 3000 chars with hook in the first ~140; hashtag counts (LinkedIn 3-5, X 1-2); link rule note. Returns whether the text fits and the trimmed hashtags; never silently truncates body text (an over-limit body signals the assemble stage to re-draft with a tighter constraint).

**Files:**
- Create: `src/engine/assemble/platform-formatter.ts`, `src/engine/assemble/platform-formatter.spec.ts`
- Modify: `package.json` (add `twitter-text`)

**Interfaces:**
- Consumes: `getLimit` (foundation platform-limits), `Draft`, `Platform`.
- Produces: `formatForPlatform(draft: Draft, platform: Platform): { fits: boolean; weightedLength: number; hashtags: string[]; overBy: number }`. For X, `weightedLength` uses `twitter-text.parseTweet().weightedLength`; for LinkedIn it is `text.length`. `hashtags` clamped to the platform's `{min,max}` (excess dropped; min is advisory, not padded).

- [ ] **Step 1: Write the failing test**

`src/engine/assemble/platform-formatter.spec.ts`:
```ts
import { formatForPlatform } from './platform-formatter';
import type { Draft } from '../types';

const make = (text: string, hashtags: string[]): Draft => ({ text, citations: [], hashtags, imageBrief: '' });

describe('formatForPlatform', () => {
  it('linkedin: fits under 3000 and clamps to max 5 hashtags', () => {
    const r = formatForPlatform(make('مرحبا', ['#a', '#b', '#c', '#d', '#e', '#f']), 'linkedin');
    expect(r.fits).toBe(true);
    expect(r.weightedLength).toBe('مرحبا'.length);
    expect(r.hashtags).toHaveLength(5);
    expect(r.overBy).toBe(0);
  });

  it('linkedin: over 3000 chars reports not fitting and overBy', () => {
    const long = 'x'.repeat(3010);
    const r = formatForPlatform(make(long, []), 'linkedin');
    expect(r.fits).toBe(false);
    expect(r.overBy).toBe(10);
  });

  it('x: uses twitter-text weighted length and 280 cap', () => {
    const r = formatForPlatform(make('hello world', ['#a', '#b', '#c']), 'x');
    expect(r.weightedLength).toBeGreaterThan(0);
    expect(r.fits).toBe(true);
    expect(r.hashtags).toHaveLength(2); // X max 2
  });

  it('x: a > 280 weighted post does not fit', () => {
    const r = formatForPlatform(make('a'.repeat(300), []), 'x');
    expect(r.fits).toBe(false);
    expect(r.overBy).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- platform-formatter`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Install twitter-text and implement**

```bash
npm i twitter-text
```

`src/engine/assemble/platform-formatter.ts`:
```ts
import twitter from 'twitter-text';
import type { Draft } from '../types';
import type { Platform } from '../../config/platform-limits';
import { getLimit } from '../../config/platform-limits';

export interface FormatResult {
  fits: boolean;
  weightedLength: number;
  hashtags: string[];
  overBy: number;
}

export function formatForPlatform(draft: Draft, platform: Platform): FormatResult {
  const limit = getLimit(platform);

  const weightedLength =
    platform === 'x' ? twitter.parseTweet(draft.text).weightedLength : draft.text.length;

  const cap = limit.maxChars;
  const overBy = Math.max(0, weightedLength - cap);
  const hashtags = draft.hashtags.slice(0, limit.hashtags.max);

  return { fits: overBy === 0, weightedLength, hashtags, overBy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- platform-formatter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/assemble/platform-formatter.ts src/engine/assemble/platform-formatter.spec.ts package.json package-lock.json
git commit -m "feat(engine): add platform formatter with twitter-text weighted counting"
```

---

### Task 18: Assemble stage (Stage 5 — persist Post at pending_review; over-limit -> re-draft signal)

> Merges text + citations + image into a persisted `Post` (status `pending_review`, `originalText` saved for learning). If the formatted text does not fit the platform limit, throws a typed signal so the pipeline re-runs the draft with a tighter character constraint (error table row: "تجميع | تجاوز الحدود | يُعاد للمرحلة ٢").

**Files:**
- Create: `src/engine/assemble/assemble.stage.ts`, `src/engine/assemble/assemble.stage.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `formatForPlatform` (Task 17), `Draft`/`ImageAsset`/`Platform`/`QuotaStatus`.
- Produces: `class PlatformLimitExceeded extends Error { overBy: number }`; `AssembleStage.run(args: { tenantId: string; brandProfileId: string; draft: Draft; image: ImageAsset | null; platform: Platform; quotaStatus: QuotaStatus; monthPlanId?: string }): Promise<string>` returns the created `postId`. Throws `PlatformLimitExceeded` when text does not fit.

- [ ] **Step 1: Write the failing test**

`src/engine/assemble/assemble.stage.spec.ts`:
```ts
import { AssembleStage, PlatformLimitExceeded } from './assemble.stage';
import type { Draft, ImageAsset } from '../types';

const draft: Draft = { text: 'مرحبا', citations: [{ claim: 'c', sourceUrl: 'https://reuters.com/x' }], hashtags: ['#a', '#b', '#c'], imageBrief: '' };
const image: ImageAsset = { url: 'http://minio/p.png', verifiedText: 'مرحبا', method: 'gpt-image', attempts: 1 };

describe('AssembleStage', () => {
  it('persists a pending_review post with citations and image', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'post-1' });
    const prisma = { post: { create } } as any;
    const stage = new AssembleStage(prisma);
    const id = await stage.run({ tenantId: 'tn', brandProfileId: 'bp', draft, image, platform: 'linkedin', quotaStatus: 'ok' });
    expect(id).toBe('post-1');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tn', brandProfileId: 'bp', platform: 'linkedin',
        status: 'pending_review', quotaStatus: 'ok', text: 'مرحبا', originalText: 'مرحبا',
        hashtags: ['#a', '#b', '#c'],
        citations: { create: [{ claim: 'c', sourceUrl: 'https://reuters.com/x' }] },
        image: { create: { url: 'http://minio/p.png', method: 'gpt-image', verifiedText: 'مرحبا', attempts: 1 } },
      }),
    }));
  });

  it('persists without image when image is null', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'post-2' });
    const prisma = { post: { create } } as any;
    const stage = new AssembleStage(prisma);
    await stage.run({ tenantId: 'tn', brandProfileId: 'bp', draft, image: null, platform: 'linkedin', quotaStatus: 'ok' });
    const arg = create.mock.calls[0][0];
    expect(arg.data.image).toBeUndefined();
  });

  it('throws PlatformLimitExceeded when text is over the limit', async () => {
    const prisma = { post: { create: jest.fn() } } as any;
    const stage = new AssembleStage(prisma);
    const long: Draft = { ...draft, text: 'x'.repeat(3001) };
    await expect(stage.run({ tenantId: 'tn', brandProfileId: 'bp', draft: long, image, platform: 'linkedin', quotaStatus: 'ok' }))
      .rejects.toBeInstanceOf(PlatformLimitExceeded);
    expect(prisma.post.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble.stage`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the stage**

`src/engine/assemble/assemble.stage.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Draft, ImageAsset, QuotaStatus } from '../types';
import type { Platform } from '../../config/platform-limits';
import { formatForPlatform } from './platform-formatter';

export class PlatformLimitExceeded extends Error {
  constructor(public readonly overBy: number) {
    super(`platform limit exceeded by ${overBy}`);
    this.name = 'PlatformLimitExceeded';
  }
}

export interface AssembleArgs {
  tenantId: string;
  brandProfileId: string;
  draft: Draft;
  image: ImageAsset | null;
  platform: Platform;
  quotaStatus: QuotaStatus;
  monthPlanId?: string;
}

@Injectable()
export class AssembleStage {
  constructor(private readonly prisma: PrismaService) {}

  async run(args: AssembleArgs): Promise<string> {
    const formatted = formatForPlatform(args.draft, args.platform);
    if (!formatted.fits) throw new PlatformLimitExceeded(formatted.overBy);

    const post = await this.prisma.post.create({
      data: {
        tenantId: args.tenantId,
        brandProfileId: args.brandProfileId,
        platform: args.platform,
        status: 'pending_review',
        quotaStatus: args.quotaStatus,
        text: args.draft.text,
        originalText: args.draft.text,
        hashtags: formatted.hashtags,
        monthPlanId: args.monthPlanId,
        citations: { create: args.draft.citations.map((c) => ({ claim: c.claim, sourceUrl: c.sourceUrl })) },
        ...(args.image
          ? { image: { create: { url: args.image.url, method: args.image.method, verifiedText: args.image.verifiedText, attempts: args.image.attempts } } }
          : {}),
      },
    });
    return post.id;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- assemble.stage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/assemble/assemble.stage.ts src/engine/assemble/assemble.stage.spec.ts
git commit -m "feat(engine): add assemble stage persisting pending_review post"
```

---

### Task 19: PipelineService (orchestrate stages 1-5 for one post)

> Runs research → draft → critique → image → assemble for a single `GenerationRequest`. Enforces the error table: a pre-flight quota check yields `skipped_quota` (throws `EngineError('..','skipped_quota')`, no provider work); an image `provider_error` after the verify/overlay chain degrades to a text-only post with a brand mark (no image); an assemble `PlatformLimitExceeded` triggers ONE re-draft pass with a tighter brief before giving up.

**Files:**
- Create: `src/engine/pipeline/pipeline.service.ts`, `src/engine/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `LiveSearchProvider` (Task 7), `DraftStage` (Task 11), `CritiqueStage` (Task 12), `GptImageProvider` (Task 16), `AssembleStage`/`PlatformLimitExceeded` (Task 18), `UsageRecorder` (Task 8), `GenerationRequest`/`PipelineResult`/`EngineError`.
- Produces: `PipelineService.generateOne(req: GenerationRequest, monthPlanId?: string): Promise<PipelineResult>`. Picks `topic` from `req.topic ?? req.brandProfile.topics[0]`.

- [ ] **Step 1: Write the failing test**

`src/engine/pipeline/pipeline.service.spec.ts`:
```ts
import { PipelineService } from './pipeline.service';
import { PlatformLimitExceeded } from '../assemble/assemble.stage';
import { EngineError } from '../types';
import type { GenerationRequest } from '../types';

const req: GenerationRequest = {
  brandProfile: { id: 'bp', tenantId: 'tn', tone: '', topics: ['eco'], prohibitions: [], competitors: [], keywords: [], learnedPreferences: '', brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' } },
  platform: 'linkedin',
  contentType: 'informational',
};
const okDraft = { text: 't', citations: [], hashtags: [], imageBrief: 'b' };

function deps(over: Record<string, any> = {}) {
  return {
    search: { research: jest.fn().mockResolvedValue({ hasFactualClaim: false, facts: [] }) },
    draftStage: { run: jest.fn().mockResolvedValue(okDraft) },
    critiqueStage: { run: jest.fn().mockResolvedValue({ draft: okDraft, issues: [] }) },
    imageProvider: { setTenant: jest.fn(), generateImage: jest.fn().mockResolvedValue({ url: 'u', verifiedText: 't', method: 'gpt-image', attempts: 1 }) },
    assembleStage: { run: jest.fn().mockResolvedValue('post-1') },
    usage: { isOverQuota: jest.fn().mockResolvedValue(false), record: jest.fn() },
    ...over,
  };
}
const make = (d: ReturnType<typeof deps>) => new PipelineService(d.search as any, d.draftStage as any, d.critiqueStage as any, d.imageProvider as any, d.assembleStage as any, d.usage as any);

describe('PipelineService', () => {
  it('runs all stages and returns ok result', async () => {
    const d = deps();
    const res = await make(d).generateOne(req);
    expect(res).toEqual({ postId: 'post-1', quotaStatus: 'ok', critiqueIssues: [], imageMethod: 'gpt-image' });
    expect(d.imageProvider.setTenant).toHaveBeenCalledWith('tn');
  });

  it('throws skipped_quota EngineError when over quota, with no provider work', async () => {
    const d = deps({ usage: { isOverQuota: jest.fn().mockResolvedValue(true), record: jest.fn() } });
    await expect(make(d).generateOne(req)).rejects.toMatchObject({ kind: 'skipped_quota' });
    expect(d.search.research).not.toHaveBeenCalled();
  });

  it('degrades to text-only post when image generation fails with provider_error', async () => {
    const d = deps({ imageProvider: { setTenant: jest.fn(), generateImage: jest.fn().mockRejectedValue(new EngineError('img down', 'provider_error')) } });
    const res = await make(d).generateOne(req);
    expect(res.imageMethod).toBeNull();
    expect(d.assembleStage.run).toHaveBeenCalledWith(expect.objectContaining({ image: null }));
  });

  it('re-drafts once with a tighter brief on PlatformLimitExceeded', async () => {
    const assembleRun = jest.fn()
      .mockRejectedValueOnce(new PlatformLimitExceeded(50))
      .mockResolvedValueOnce('post-2');
    const d = deps({ assembleStage: { run: assembleRun } });
    const res = await make(d).generateOne(req);
    expect(res.postId).toBe('post-2');
    expect(d.draftStage.run).toHaveBeenCalledTimes(2); // initial + tighter re-draft
    expect(assembleRun).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline.service`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

`src/engine/pipeline/pipeline.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { GenerationRequest, PipelineResult, Draft, ImageAsset } from '../types';
import { EngineError } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { LiveSearchProvider } from '../search/live-search.provider';
import { DraftStage } from '../draft/draft.stage';
import { CritiqueStage } from '../draft/critique.stage';
import { GptImageProvider } from '../providers/openai/gpt-image.provider';
import { AssembleStage, PlatformLimitExceeded } from '../assemble/assemble.stage';
import { UsageRecorder } from '../usage/usage.recorder';

@Injectable()
export class PipelineService {
  constructor(
    private readonly search: LiveSearchProvider,
    private readonly draftStage: DraftStage,
    private readonly critiqueStage: CritiqueStage,
    private readonly imageProvider: GptImageProvider,
    private readonly assembleStage: AssembleStage,
    private readonly usage: UsageRecorder,
  ) {}

  async generateOne(req: GenerationRequest, monthPlanId?: string): Promise<PipelineResult> {
    const { brandProfile: brand, platform, contentType } = req;

    if (await this.usage.isOverQuota(brand.tenantId)) {
      throw new EngineError('usage cap reached', 'skipped_quota');
    }

    const topic = req.topic ?? brand.topics[0] ?? '';
    const factSet = await this.search.research(topic, brand);

    const baseInput: DraftInput = { factSet, brand, platform, contentType, brief: req.brief };
    let draft: Draft = await this.draftStage.run(baseInput);
    const critiqued = await this.critiqueStage.run(draft, baseInput);
    draft = critiqued.draft;

    let image: ImageAsset | null = null;
    try {
      this.imageProvider.setTenant(brand.tenantId);
      image = await this.imageProvider.generateImage(draft.imageBrief, brand.brandKit, platform);
    } catch (err) {
      if (err instanceof EngineError && err.kind === 'provider_error') {
        image = null; // degrade to text-only post with brand mark
      } else {
        throw err;
      }
    }

    const assembleArgs = {
      tenantId: brand.tenantId,
      brandProfileId: brand.id,
      draft,
      image,
      platform,
      quotaStatus: 'ok' as const,
      monthPlanId,
    };

    let postId: string;
    try {
      postId = await this.assembleStage.run(assembleArgs);
    } catch (err) {
      if (err instanceof PlatformLimitExceeded) {
        const tighterBrief = `${req.brief ?? ''} (Strictly shorter: exceed limit by ${err.overBy} fewer characters.)`.trim();
        const tighter: DraftInput = { ...baseInput, brief: tighterBrief };
        draft = await this.draftStage.run(tighter);
        postId = await this.assembleStage.run({ ...assembleArgs, draft });
      } else {
        throw err;
      }
    }

    return {
      postId,
      quotaStatus: 'ok',
      critiqueIssues: critiqued.issues,
      imageMethod: image ? image.method : null,
    };
  }
}
```

- [ ] **Step 4: Fix the `PipelineResult.imageMethod` type to allow null**

In `src/engine/types.ts`, change the `PipelineResult.imageMethod` field added in Task 3:
```ts
export interface PipelineResult {
  postId: string;
  quotaStatus: QuotaStatus;
  critiqueIssues: string[];
  imageMethod: ImageAsset['method'] | null;
}
```
Update the Task 3 test expectation accordingly if it pinned a non-null method (the Task 3 test used `imageMethod: 'gpt-image'`, which still satisfies the widened type — no change needed).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- pipeline.service && npm test -- engine/types`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add src/engine/pipeline src/engine/types.ts
git commit -m "feat(engine): add PipelineService orchestrating all five stages"
```

---

### Task 20: Saudi calendar distributor (month-plan scheduling)

> Distributes `count` posts across the month, favoring Saudi occasions/seasons when present, otherwise spreading evenly. Pure function — deterministic and unit-tested. (Occasion data is seeded later in Phase 4; here we consume a passed-in occasion list, defaulting to empty.)

**Files:**
- Create: `src/engine/month-plan/saudi-calendar.ts`, `src/engine/month-plan/saudi-calendar.spec.ts`

**Interfaces:**
- Produces: `distributePlan(count: number, monthStart: Date, occasions?: { date: Date; name: string }[]): { date: Date; occasion?: string }[]` — returns `count` slots within the 28+ day month, occasion dates first (deduped), remainder spread evenly.

- [ ] **Step 1: Write the failing test**

`src/engine/month-plan/saudi-calendar.spec.ts`:
```ts
import { distributePlan } from './saudi-calendar';

describe('distributePlan', () => {
  const start = new Date('2026-07-01T00:00:00.000Z');

  it('returns exactly count slots', () => {
    expect(distributePlan(4, start)).toHaveLength(4);
  });

  it('spreads evenly across the month when no occasions', () => {
    const slots = distributePlan(2, start);
    expect(slots[0].date.getUTCDate()).toBeLessThan(slots[1].date.getUTCDate());
    slots.forEach((s) => expect(s.occasion).toBeUndefined());
  });

  it('places occasion dates first and tags them', () => {
    const occ = [{ date: new Date('2026-07-10T00:00:00.000Z'), name: 'National Day' }];
    const slots = distributePlan(3, start, occ);
    expect(slots.some((s) => s.occasion === 'National Day')).toBe(true);
    expect(slots).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- saudi-calendar`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the distributor**

`src/engine/month-plan/saudi-calendar.ts`:
```ts
export interface PlanSlot {
  date: Date;
  occasion?: string;
}

export function distributePlan(
  count: number,
  monthStart: Date,
  occasions: { date: Date; name: string }[] = [],
): PlanSlot[] {
  const slots: PlanSlot[] = [];
  const usedDays = new Set<number>();

  // 1) Occasion slots first (within the month, deduped, capped at count).
  for (const occ of occasions) {
    if (slots.length >= count) break;
    const day = occ.date.getUTCDate();
    if (usedDays.has(day)) continue;
    usedDays.add(day);
    slots.push({ date: new Date(occ.date), occasion: occ.name });
  }

  // 2) Remaining slots spread evenly across days 1..28.
  const remaining = count - slots.length;
  if (remaining > 0) {
    const step = Math.max(1, Math.floor(28 / remaining));
    let day = 1;
    for (let i = 0; i < remaining; i += 1) {
      while (usedDays.has(day) && day <= 28) day += 1;
      const date = new Date(monthStart);
      date.setUTCDate(Math.min(day, 28));
      usedDays.add(day);
      slots.push({ date });
      day += step;
    }
  }

  return slots.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, count);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- saudi-calendar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/month-plan/saudi-calendar.ts src/engine/month-plan/saudi-calendar.spec.ts
git commit -m "feat(engine): add Saudi calendar month-plan distributor"
```

---

### Task 21: Month-plan processor (BullMQ worker — progress, skipped_quota vs provider_error)

> The async month-plan worker (NFR-2). Iterates the distributed slots, runs the pipeline per post, updates `MonthPlan` progress after each. Per the error table: a `skipped_quota` EngineError marks the post skipped, increments `skippedQuota`, and CONTINUES without retry; a `provider_error` increments `failed` (BullMQ retry handles transient retry at the job level — a single post failure never drops the plan). The whole plan never aborts mid-way.

**Files:**
- Create: `src/engine/month-plan/month-plan.processor.ts`, `src/engine/month-plan/month-plan.processor.spec.ts`
- Modify: `package.json` (add `bullmq`)

**Interfaces:**
- Consumes: `PipelineService` (Task 19), `PrismaService`, `distributePlan` (Task 20), `EngineError`, `GenerationRequest`.
- Produces: `MonthPlanJobData = { monthPlanId: string; tenantId: string; request: GenerationRequest; count: number; monthStartIso: string }`; `MonthPlanProcessor.process(data: MonthPlanJobData, updateProgress: (n: number) => Promise<void>): Promise<MonthPlanProgress>`. The processor is the BullMQ `Worker` callback body (extracted for unit testing without Redis).

- [ ] **Step 1: Install BullMQ**

```bash
npm i bullmq
```

- [ ] **Step 2: Write the failing test**

`src/engine/month-plan/month-plan.processor.spec.ts`:
```ts
import { MonthPlanProcessor } from './month-plan.processor';
import { EngineError } from '../types';
import type { GenerationRequest } from '../types';

const request: GenerationRequest = {
  brandProfile: { id: 'bp', tenantId: 'tn', tone: '', topics: ['eco'], prohibitions: [], competitors: [], keywords: [], learnedPreferences: '', brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' } },
  platform: 'linkedin',
  contentType: 'informational',
};
const data = { monthPlanId: 'mp', tenantId: 'tn', request, count: 3, monthStartIso: '2026-07-01T00:00:00.000Z' };

function prismaMock() {
  return { monthPlan: { update: jest.fn().mockResolvedValue({}) } } as any;
}

describe('MonthPlanProcessor', () => {
  it('runs the pipeline per slot and reports completion progress', async () => {
    const pipeline = { generateOne: jest.fn().mockResolvedValue({ postId: 'p', quotaStatus: 'ok', critiqueIssues: [], imageMethod: 'gpt-image' }) } as any;
    const prisma = prismaMock();
    const updateProgress = jest.fn().mockResolvedValue(undefined);
    const proc = new MonthPlanProcessor(pipeline, prisma);
    const res = await proc.process(data, updateProgress);
    expect(res).toEqual({ total: 3, completed: 3, failed: 0, skippedQuota: 0, status: 'done' });
    expect(updateProgress).toHaveBeenLastCalledWith(100);
  });

  it('marks skipped_quota and continues without counting it as failed', async () => {
    const pipeline = {
      generateOne: jest.fn()
        .mockResolvedValueOnce({ postId: 'p1', quotaStatus: 'ok', critiqueIssues: [], imageMethod: null })
        .mockRejectedValue(new EngineError('cap', 'skipped_quota')),
    } as any;
    const proc = new MonthPlanProcessor(pipeline, prismaMock());
    const res = await proc.process(data, jest.fn().mockResolvedValue(undefined));
    expect(res).toEqual({ total: 3, completed: 1, failed: 0, skippedQuota: 2, status: 'done' });
  });

  it('counts provider_error as failed but still finishes the plan', async () => {
    const pipeline = {
      generateOne: jest.fn()
        .mockResolvedValueOnce({ postId: 'p1', quotaStatus: 'ok', critiqueIssues: [], imageMethod: null })
        .mockRejectedValueOnce(new EngineError('down', 'provider_error'))
        .mockResolvedValueOnce({ postId: 'p3', quotaStatus: 'ok', critiqueIssues: [], imageMethod: null }),
    } as any;
    const proc = new MonthPlanProcessor(pipeline, prismaMock());
    const res = await proc.process(data, jest.fn().mockResolvedValue(undefined));
    expect(res).toEqual({ total: 3, completed: 2, failed: 1, skippedQuota: 0, status: 'done' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- month-plan.processor`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement the processor**

`src/engine/month-plan/month-plan.processor.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { EngineError } from '../types';
import type { GenerationRequest, MonthPlanProgress } from '../types';
import { distributePlan } from './saudi-calendar';

export interface MonthPlanJobData {
  monthPlanId: string;
  tenantId: string;
  request: GenerationRequest;
  count: number;
  monthStartIso: string;
}

@Injectable()
export class MonthPlanProcessor {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly prisma: PrismaService,
  ) {}

  async process(
    data: MonthPlanJobData,
    updateProgress: (percent: number) => Promise<void>,
  ): Promise<MonthPlanProgress> {
    const slots = distributePlan(data.count, new Date(data.monthStartIso));
    const progress: MonthPlanProgress = {
      total: slots.length, completed: 0, failed: 0, skippedQuota: 0, status: 'running',
    };
    await this.persist(data.monthPlanId, progress);

    for (let i = 0; i < slots.length; i += 1) {
      try {
        await this.pipeline.generateOne(data.request, data.monthPlanId);
        progress.completed += 1;
      } catch (err) {
        if (err instanceof EngineError && err.kind === 'skipped_quota') {
          progress.skippedQuota += 1; // expected cap, not a failure; no retry
        } else {
          progress.failed += 1; // provider_error / other: plan continues, post marked failed
        }
      }
      await this.persist(data.monthPlanId, progress);
      await updateProgress(Math.round(((i + 1) / slots.length) * 100));
    }

    progress.status = 'done';
    await this.persist(data.monthPlanId, progress);
    return progress;
  }

  private async persist(monthPlanId: string, p: MonthPlanProgress): Promise<void> {
    await this.prisma.monthPlan.update({
      where: { id: monthPlanId },
      data: { completed: p.completed, failed: p.failed, skippedQuota: p.skippedQuota, status: p.status },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- month-plan.processor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/month-plan/month-plan.processor.ts src/engine/month-plan/month-plan.processor.spec.ts package.json package-lock.json
git commit -m "feat(engine): add month-plan processor distinguishing skipped_quota from provider_error"
```

---

### Task 22: Month-plan service (enqueue job + read progress) + BullMQ Worker wiring

> Creates the `MonthPlan` row, enqueues a BullMQ job, and exposes progress. The Worker is registered to call `MonthPlanProcessor.process` with BullMQ's `job.updateProgress`.

**Files:**
- Create: `src/engine/month-plan/month-plan.service.ts`, `src/engine/month-plan/month-plan.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `MonthPlanProcessor` (Task 21), `bullmq` `Queue`/`Worker`, `MonthPlanProgress`, `GenerationRequest`.
- Produces: `MonthPlanService` with `enqueue(args: { tenantId: string; request: GenerationRequest; count: number; monthStartIso: string }): Promise<{ monthPlanId: string }>` and `getProgress(monthPlanId: string): Promise<MonthPlanProgress>`. Reads `REDIS_URL` for the queue connection (queue name `month-plan`).

- [ ] **Step 1: Write the failing test (Queue mocked)**

`src/engine/month-plan/month-plan.service.spec.ts`:
```ts
import { MonthPlanService } from './month-plan.service';

const add = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: (...a: unknown[]) => add(...a) })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

const request: any = {
  brandProfile: { id: 'bp', tenantId: 'tn', topics: ['eco'] }, platform: 'linkedin', contentType: 'informational',
};

describe('MonthPlanService', () => {
  beforeEach(() => add.mockReset());

  it('creates a MonthPlan row and enqueues a job', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'mp-1' });
    const prisma = { monthPlan: { create, findUniqueOrThrow: jest.fn() } } as any;
    add.mockResolvedValue({});
    const svc = new MonthPlanService(prisma, { process: jest.fn() } as any, { get: () => 'redis://localhost:6379' } as any);
    const res = await svc.enqueue({ tenantId: 'tn', request, count: 5, monthStartIso: '2026-07-01T00:00:00.000Z' });
    expect(res).toEqual({ monthPlanId: 'mp-1' });
    expect(create).toHaveBeenCalledWith({ data: { tenantId: 'tn', total: 5, status: 'queued' } });
    expect(add).toHaveBeenCalledWith('generate', expect.objectContaining({ monthPlanId: 'mp-1', count: 5 }));
  });

  it('reads progress from the MonthPlan row', async () => {
    const prisma = { monthPlan: { create: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ total: 5, completed: 2, failed: 1, skippedQuota: 1, status: 'running' }) } } as any;
    const svc = new MonthPlanService(prisma, { process: jest.fn() } as any, { get: () => 'redis://localhost:6379' } as any);
    expect(await svc.getProgress('mp-1')).toEqual({ total: 5, completed: 2, failed: 1, skippedQuota: 1, status: 'running' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- month-plan.service`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

`src/engine/month-plan/month-plan.service.ts`:
```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MonthPlanProcessor, MonthPlanJobData } from './month-plan.processor';
import type { GenerationRequest, MonthPlanProgress } from '../types';

const QUEUE_NAME = 'month-plan';

@Injectable()
export class MonthPlanService implements OnModuleInit {
  private readonly queue: Queue;
  private readonly connection: { url: string };

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: MonthPlanProcessor,
    config: ConfigService,
  ) {
    this.connection = { url: config.get<string>('REDIS_URL')! };
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  onModuleInit(): void {
    new Worker<MonthPlanJobData>(
      QUEUE_NAME,
      async (job: Job<MonthPlanJobData>) =>
        this.processor.process(job.data, async (p) => {
          await job.updateProgress(p);
        }),
      { connection: this.connection, settings: { backoffStrategy: () => 5000 } },
    );
  }

  async enqueue(args: {
    tenantId: string;
    request: GenerationRequest;
    count: number;
    monthStartIso: string;
  }): Promise<{ monthPlanId: string }> {
    const plan = await this.prisma.monthPlan.create({
      data: { tenantId: args.tenantId, total: args.count, status: 'queued' },
    });
    await this.queue.add(
      'generate',
      {
        monthPlanId: plan.id,
        tenantId: args.tenantId,
        request: args.request,
        count: args.count,
        monthStartIso: args.monthStartIso,
      } satisfies MonthPlanJobData,
      { attempts: 1 }, // per-post retry is handled inside the processor; the plan itself is not retried
    );
    return { monthPlanId: plan.id };
  }

  async getProgress(monthPlanId: string): Promise<MonthPlanProgress> {
    const p = await this.prisma.monthPlan.findUniqueOrThrow({ where: { id: monthPlanId } });
    return {
      total: p.total,
      completed: p.completed,
      failed: p.failed,
      skippedQuota: p.skippedQuota,
      status: p.status as MonthPlanProgress['status'],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- month-plan.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/month-plan/month-plan.service.ts src/engine/month-plan/month-plan.service.spec.ts
git commit -m "feat(engine): add month-plan service with BullMQ enqueue and progress"
```

---

### Task 23: Learning service (diff original<->approved -> learnedPreferences)

> Light learning at launch: when a customer edits/approves a post, diff `originalText` vs the approved text, summarize the change via Claude, and append it to `BrandProfile.learnedPreferences` (injected into future `DraftInput`). No automated loop. Skips when text is unchanged.

**Files:**
- Create: `src/engine/learning/learning.service.ts`, `src/engine/learning/learning.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ClaudeClient` (Task 4), `UsageRecorder` (Task 8).
- Produces: `LearningService.captureApproval(postId: string): Promise<void>` — loads the post (with `originalText`, current `text`, `brandProfileId`, `tenantId`); if changed, summarizes the diff and appends to the brand profile's `learnedPreferences`.

- [ ] **Step 1: Write the failing test**

`src/engine/learning/learning.service.spec.ts`:
```ts
import { LearningService } from './learning.service';

function prismaMock(post: any) {
  return {
    post: { findUniqueOrThrow: jest.fn().mockResolvedValue(post) },
    brandProfile: { findUniqueOrThrow: jest.fn().mockResolvedValue({ learnedPreferences: 'existing.' }), update: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe('LearningService', () => {
  it('summarizes the edit and appends to learnedPreferences', async () => {
    const prisma = prismaMock({ id: 'p1', tenantId: 'tn', brandProfileId: 'bp', originalText: 'A', text: 'B' });
    const claude = { complete: jest.fn().mockResolvedValue({ text: 'Prefers shorter sentences.', inputTokens: 5, outputTokens: 5 }) } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    await new LearningService(prisma, claude, usage).captureApproval('p1');
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'bp' },
      data: { learnedPreferences: 'existing.\nPrefers shorter sentences.' },
    });
    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tn', kind: 'text' }));
  });

  it('does nothing when the text was not changed', async () => {
    const prisma = prismaMock({ id: 'p1', tenantId: 'tn', brandProfileId: 'bp', originalText: 'same', text: 'same' });
    const claude = { complete: jest.fn() } as any;
    const usage = { record: jest.fn() } as any;
    await new LearningService(prisma, claude, usage).captureApproval('p1');
    expect(claude.complete).not.toHaveBeenCalled();
    expect(prisma.brandProfile.update).not.toHaveBeenCalled();
  });

  it('does nothing when originalText is missing', async () => {
    const prisma = prismaMock({ id: 'p1', tenantId: 'tn', brandProfileId: 'bp', originalText: null, text: 'B' });
    const claude = { complete: jest.fn() } as any;
    const usage = { record: jest.fn() } as any;
    await new LearningService(prisma, claude, usage).captureApproval('p1');
    expect(claude.complete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- learning.service`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the service**

`src/engine/learning/learning.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeClient } from '../providers/claude/claude.client';
import { UsageRecorder } from '../usage/usage.recorder';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly usage: UsageRecorder,
  ) {}

  async captureApproval(postId: string): Promise<void> {
    const post = await this.prisma.post.findUniqueOrThrow({ where: { id: postId } });
    if (!post.originalText || post.originalText === post.text) return;

    const system =
      'You compare an original AI draft to the human-approved version and summarize, in ONE short ' +
      'English sentence, the editing preference it reveals (tone, length, wording). Output only that sentence.';
    const user = `Original:\n${post.originalText}\n\nApproved:\n${post.text}`;
    const res = await this.claude.complete({ system, user, maxTokens: 256 });
    await this.usage.record({
      tenantId: post.tenantId,
      kind: 'text',
      units: res.inputTokens + res.outputTokens,
      costUsd: 0,
    });

    const summary = res.text.trim();
    if (!summary) return;

    const brand = await this.prisma.brandProfile.findUniqueOrThrow({ where: { id: post.brandProfileId } });
    const updated = brand.learnedPreferences ? `${brand.learnedPreferences}\n${summary}` : summary;
    await this.prisma.brandProfile.update({
      where: { id: post.brandProfileId },
      data: { learnedPreferences: updated },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- learning.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/learning/learning.service.ts src/engine/learning/learning.service.spec.ts
git commit -m "feat(engine): add light learning service (edit diff -> learnedPreferences)"
```

---

### Task 24: EngineModule wiring + env keys + provider seam bindings

> Wires every engine provider into a Nest module, binds the seam tokens (`ContentProvider` → `ClaudeContentProvider`, `ImageProvider` → `GptImageProvider`, `SearchProvider` → `LiveSearchProvider`) so consumers depend on the interface, supplies the injectable `CandidateUrlProvider` (real impl), and registers the module in `AppModule`. Adds the engine env keys.

**Files:**
- Create: `src/engine/engine.module.ts`, `src/engine/engine.module.spec.ts`
- Modify: `src/app.module.ts`, `.env.example`

**Interfaces:**
- Consumes: every provider/stage/service from Tasks 4-23, `PrismaModule` (foundation, global).
- Produces: `EngineModule` exporting `PipelineService`, `MonthPlanService`, `LearningService`; DI tokens `'ContentProvider'`, `'ImageProvider'`, `'SearchProvider'`.

- [ ] **Step 1: Add engine env keys to `.env.example`**

Append to `.env.example`:
```
ENGINE_SEARCH_MAX_FETCHES=5
ENGINE_CRITIQUE_MAX_ROUNDS=3
ENGINE_MONTHLY_UNIT_CAP=100000
ENGINE_TRUSTED_DOMAINS_EXTRA=
OVERLAY_FONT_PATH=./assets/fonts/IBMPlexSansArabic-Regular.ttf
```

- [ ] **Step 2: Write the failing test (module compiles + resolves PipelineService)**

`src/engine/engine.module.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EngineModule } from './engine.module';
import { PipelineService } from './pipeline/pipeline.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EngineModule', () => {
  it('resolves PipelineService and binds the seam tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), EngineModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(PipelineService)).toBeInstanceOf(PipelineService);
    expect(moduleRef.get('ContentProvider')).toBeDefined();
    expect(moduleRef.get('ImageProvider')).toBeDefined();
    expect(moduleRef.get('SearchProvider')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- engine.module`
Expected: FAIL — cannot find `./engine.module`.

- [ ] **Step 4: Implement the module**

`src/engine/engine.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

import { ClaudeClient } from './providers/claude/claude.client';
import { ClaudeContentProvider } from './providers/claude/claude-content.provider';
import { OpenAiImageClient } from './providers/openai/openai-image.client';
import { VisionVerifier } from './providers/openai/vision-verifier';
import { OverlayRenderer } from './providers/openai/overlay-renderer';
import { GptImageProvider } from './providers/openai/gpt-image.provider';
import { ImageStorageService } from './storage/image-storage.service';

import { SourceFetcher } from './search/source-fetcher';
import { FactExtractor } from './search/fact-extractor';
import { LiveSearchProvider, CandidateUrlProvider } from './search/live-search.provider';

import { UsageRecorder } from './usage/usage.recorder';
import { DraftStage } from './draft/draft.stage';
import { CritiqueStage } from './draft/critique.stage';
import { AssembleStage } from './assemble/assemble.stage';
import { PipelineService } from './pipeline/pipeline.service';

import { MonthPlanProcessor } from './month-plan/month-plan.processor';
import { MonthPlanService } from './month-plan/month-plan.service';
import { LearningService } from './learning/learning.service';

// Real candidate URL provider: a whitelist-restricted web search.
// Replace the body with a live search SDK call (results filtered by isDomainAllowed
// at fetch time in SourceFetcher). Returns site-scoped query URLs by default.
const candidateUrlProvider: CandidateUrlProvider = async (topic, whitelist) =>
  whitelist.map((domain) => `https://${domain}/?q=${encodeURIComponent(topic)}`);

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    ClaudeClient,
    OpenAiImageClient,
    VisionVerifier,
    OverlayRenderer,
    ImageStorageService,
    SourceFetcher,
    FactExtractor,
    UsageRecorder,
    DraftStage,
    CritiqueStage,
    AssembleStage,
    PipelineService,
    MonthPlanProcessor,
    MonthPlanService,
    LearningService,
    ClaudeContentProvider,
    GptImageProvider,
    { provide: 'CANDIDATE_URL_PROVIDER', useValue: candidateUrlProvider },
    {
      provide: LiveSearchProvider,
      inject: [SourceFetcher, FactExtractor, UsageRecorder, 'CANDIDATE_URL_PROVIDER'],
      useFactory: (f: SourceFetcher, e: FactExtractor, u: UsageRecorder, c: CandidateUrlProvider) =>
        new LiveSearchProvider(f, e, u, c),
    },
    // Seam token bindings: consumers depend on the interface, not the concrete class.
    { provide: 'ContentProvider', useExisting: ClaudeContentProvider },
    { provide: 'ImageProvider', useExisting: GptImageProvider },
    { provide: 'SearchProvider', useExisting: LiveSearchProvider },
  ],
  exports: [PipelineService, MonthPlanService, LearningService],
})
export class EngineModule {}
```

- [ ] **Step 5: Register `EngineModule` in `src/app.module.ts`**

Add `EngineModule` to the `imports` array of `AppModule` (alongside `PrismaModule`, `HealthModule`):
```ts
import { EngineModule } from './engine/engine.module';
// ...
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, HealthModule, EngineModule],
})
export class AppModule {}
```

- [ ] **Step 6: Run test + full suite + typecheck**

Run: `npm test -- engine.module && npm run typecheck && npm test`
Expected: PASS (module test), no type errors, full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/engine/engine.module.ts src/engine/engine.module.spec.ts src/app.module.ts .env.example
git commit -m "feat(engine): wire EngineModule with seam bindings and register in app"
```

---

## Self-Review

**1. Spec coverage (against [16-معمارية-المحرّك.md](../blueprint/16-معمارية-المحرّك.md)):**

- Principles — citation control (search stage builds facts; Claude writes from them) → Tasks 5-7, 10 ✓. Clear testable pipeline (each stage its own unit) → Tasks 7, 11, 12, 16, 18 ✓. Quality-before-customer (critique loop) → Task 12 ✓. Driven by BrandProfile (tone/topics/prohibitions/learnedPreferences fed into every stage) → Tasks 9, 10 ✓. Cost as constraint (UsageRecord per AI call + cap) → Task 8, and recording in Tasks 7, 11, 12, 16, 23 ✓. Provider behind interface → Tasks 4, 10, 14, 16; seam bindings Task 24 ✓.
- Inputs (BrandProfile, BrandKit, GenerationRequest, ContentType) → foundation types reused; engine additions Task 3 ✓.
- Stage 1 research + FactSet/Fact, whitelist restriction, no-source→`hasFactualClaim=false` no fabrication, fetch cap → Tasks 2, 5, 6, 7 ✓.
- Stage 2 draft + Draft/Citation/imageBrief, platform-aware writing, claim-source pairing → Task 10 (formatting validated in 17) ✓.
- Stage 3 critique + Rubric/CritiqueResult, 2-3 round cap, best version + issues → Tasks 9, 12 ✓.
- Image decision gate (20-image, real Arabic from tenant topics, <10% vs ≥10% rule, fixes `method`/`attempts`) → Task 1, consumed in Task 16 ✓.
- Stage 4 image + ImageAsset, gpt-image + vision verify + regenerate cap + overlay fallback, platform sizing → Tasks 13-16 ✓.
- Stage 5 assemble + apply platform-limits, `draft → pending_review` → Tasks 17, 18 ✓.
- Month plan async (BullMQ, distribute over Saudi calendar, progress, per-post failure isolation, mid-plan `skipped_quota` no-drop no-retry) → Tasks 20, 21, 22 ✓.
- Light learning (diff original↔approved → learnedPreferences, injected into DraftInput, full automation = V2 deferred) → Task 23 ✓.
- Error-handling table: search no-source → Task 7; draft `provider_error` retry+UsageRecord → Tasks 4 (EngineError) + 21 (BullMQ/processor failed-count) + usage in 11; `skipped_quota` distinct from `provider_error` → Tasks 8, 19, 21 (explicit tests) ✓; critique no-pass after 3 → Task 12; image breakage after 3 → overlay, then text-only → Tasks 16 (overlay) + 19 (text-only degrade) ✓; assemble over-limit → re-draft → Tasks 18 + 19 ✓.
- External consumed interfaces: ContentProvider→Claude, ImageProvider→gpt-image+verify+overlay, SearchProvider (REAL impl owned here) + trusted-sources, platform-limits + twitter-text → Tasks 2, 4, 7, 10, 14-17, 24 ✓.
- Platform values from [15](../blueprint/15-مواصفات-المنصات.md): LinkedIn 3000 / hook 140 / 3-5 hashtags; X 280 weighted via twitter-text / 1-2 hashtags; safe 1200×1200 — applied in Task 17 (counts) and consumed from foundation Task 5 config; gate/image sizing Tasks 1, 16 ✓.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows complete code. Task 1 Step 6 and Step 9 intentionally instruct copying the *measured* gate result into the committed const — that is a real recorded value, not a placeholder; a concrete default (`gpt-image`/3) is provided so the plan is runnable even before the manual run. The `candidateUrlProvider` in Task 24 ships a working default (site-scoped query URLs, all whitelist-guarded at fetch time) with a note to swap in a search SDK — functional, not a stub.

**3. Type consistency:**
- `EngineError(message, kind)`, `EngineErrorKind`, `QuotaStatus`, `PipelineResult`, `MonthPlanProgress` defined once (Task 3); `PipelineResult.imageMethod` widened to `| null` in Task 19 Step 4 (the only redefinition, explicitly reconciled).
- `Draft`, `FactSet`, `Fact`, `Citation`, `ImageAsset`, `Rubric`, `CritiqueResult`, `BrandProfileInput`, `BrandKit`, `GenerationRequest`, `DraftInput`, `Platform`, `ContentType` all imported from foundation `src/engine/types.ts` / interfaces — never redefined here.
- `ImageAsset.method` union `'gpt-image' | 'overlay-fallback'` consistent across Tasks 16, 18 and foundation schema string column.
- `GateDecision`/`GateSample` defined in Task 1, imported by Task 16 via `image-gate.config`.
- `UsageRecorder.record(input)` signature stable across Tasks 7, 8, 11, 12, 16, 23. `setTenant`/`generateImage` on `GptImageProvider` consistent across Tasks 16, 19, 24.
- `formatForPlatform` / `FormatResult` (Task 17) used by Task 18; `PlatformLimitExceeded` thrown in 18, caught in 19.
- `MonthPlanJobData` defined Task 21, used Task 22. `distributePlan`/`PlanSlot` defined Task 20, used Task 21.

**4. Scope / deferred items (intentional, spec-grounded):**
- **Full automated learning from analytics/performance** — explicitly V2 in [16](../blueprint/16-معمارية-المحرّك.md) ("التعلّم المؤتمت الكامل = V2"). Only light edit-diff learning is built (Task 23).
- **HTTP controllers / auth guards for engine endpoints** — the engine is invoked internally (pipeline + month-plan job); per the prompt, Auth/Tenant context is Phase 3. `tenantId` is passed explicitly throughout. Exposing `POST /api/v1/generate` and `GET /api/v1/month-plans/:id` is a thin Phase-3/UI wiring task, not engine logic — deferred to keep this plan to the engine only ([16](../blueprint/16-معمارية-المحرّك.md) "ما هو خارج هذا الـspec": frontend/manual-publish/calendar UI).
- **Saudi occasion seed data** — [16](../blueprint/16-معمارية-المحرّك.md) references the Saudi calendar; the *distribution algorithm* is built (Task 20) and consumes an occasions list, but the occasion table/seed is Phase 4 ([13-خطة-التنفيذ-التقنية.md](../blueprint/13-خطة-التنفيذ-التقنية.md) Sprint 3, `SaudiOccasion` noted in foundation schema comment). The distributor degrades gracefully to even spread with an empty list.
- **Real web-search SDK** — the `CandidateUrlProvider` seam is implemented with a functional whitelist-scoped default; swapping in a specific search vendor SDK is a one-line provider change (Task 24) and vendor selection is out of [16](../blueprint/16-معمارية-المحرّك.md)'s scope.

All other spec items map to a concrete task above.
