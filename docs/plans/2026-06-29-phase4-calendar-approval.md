# Phase 4 — Calendar & Approval (التقويم والاعتماد) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the content-organization layer that sits between the engine (Phase 1) and publishing (Phase 5): a Saudi-occasion + scheduled-post calendar, a strict draft→pending_review→approved approval state machine, and `scheduledAt` reminder scheduling — all multi-tenant, read/transition only, with no content generation and no actual publishing.

**Architecture:** Four NestJS modules over the existing Prisma schema. `PostStateMachine` is a pure, DB-free unit owning `ALLOWED_TRANSITIONS`. `OccasionService` reads the new `SaudiOccasion` reference table (seeded, never computed at request time). `PostService` reads/filters posts and applies content-edit + state-transition atomically in one transaction. `CalendarService` merges occasions and scheduled posts into a date-sorted `CalendarEntry[]`. A standalone `HijriOccasionSeeder` script (not an HTTP route) precomputes Hijri→Gregorian occasion rows idempotently.

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, Jest, `moment-hijri` (seeder only). Builds on the Foundation (Sprint 0) plan.

## Global Constraints

- Multi-tenant logical: every query and every state transition MUST be scoped by `tenantId`; cross-tenant access returns `NOT_FOUND` (404, never 403). (from foundation plan + spec §2)
- Code, identifiers, comments, commit messages: **English only**. Arabic only in user-facing strings (`SaudiOccasion.nameAr`, error `message` bodies). Error bodies are `{ code, message }`. (from foundation plan + spec §6)
- Route prefix `api/v1` is already set in `src/main.ts` (foundation). Controllers declare paths without that prefix.
- Auth/tenant context from Phase 3: `@CurrentTenant() ctx: TenantContext` where `TenantContext = { userId: string; tenantId: string }`, guarded by `JwtAuthGuard, TenantGuard`. **Assume these exist.** `tenantId` comes ONLY from the JWT context, never from the request body or params.
- This phase CONSUMES Phase 1 output `Post(status='draft')`. Do NOT modify the engine contract; this phase is read/transition only.
- Existing Prisma models (foundation): `Tenant, User, BrandProfile, AccountProfile, Post, ImageAsset, SourceCitation, Subscription, UsageRecord`. Enums: `Platform { linkedin, x }`, `PostStatus { draft, pending_review, approved, published }`, `SubscriptionStatus`. `Post.status` and `Post.scheduledAt` already exist — this phase only writes them. (from foundation plan)
- Add only the new `SaudiOccasion` table, via a NEW migration. Never edit an applied migration (LR-004).
- `PATCH /posts/:id` applies content edit + state transition ATOMICALLY in one transaction; the transition is validated against the current actual status BEFORE any write; `approved→published` is REJECTED here (Phase 5 owns it).
- Occasions: Hijri dates are precomputed by the seeder into Gregorian rows; NO Hijri computation in the request path. National Day (Sep 23) and Foundation Day (Feb 22) are fixed Gregorian. Commercial seasons (`back-to-school`, `white-friday`, `year-end-sale`) get distinct slugs.
- Calendar range hard cap: 92 days; wider ranges are rejected with `RANGE_TOO_WIDE`.
- TDD: failing test first, minimal impl, commit per task. Jest config lives in `package.json` (foundation).

## File Structure

```
prisma/schema.prisma                                  # MODIFY: add SaudiOccasion model
prisma/migrations/<ts>_add_saudi_occasion/            # NEW migration (Task 1)
prisma/seeds/hijri-occasion.seeder.ts                 # seeder script (Task 8)
prisma/seeds/occasion-definitions.ts                  # static occasion defs + commercial ranges (Task 8)

src/common/errors/app-error.ts                        # AppError + ErrorCode + Nest exception mapping (Task 2)
src/common/errors/app-error.spec.ts

src/posts/post-state-machine.ts                       # pure, DB-free transition validator (Task 3)
src/posts/post-state-machine.spec.ts

src/posts/dto/list-posts.dto.ts                       # GET /posts query DTO (Task 5)
src/posts/dto/patch-post.dto.ts                       # PATCH /posts/:id body DTO (Task 6)
src/posts/post.types.ts                               # PostListItem, PostDetail, CalendarPostSummary (Task 4)
src/posts/post.service.ts                             # list + getDetail + patch (Tasks 5,6)
src/posts/post.service.spec.ts
src/posts/post.controller.ts                          # GET /posts, PATCH /posts/:id (Tasks 5,6)
src/posts/post.controller.spec.ts
src/posts/post.module.ts                              # (Task 5)

src/occasions/occasion.types.ts                       # SaudiOccasion domain type + kinds (Task 4)
src/occasions/occasion.service.ts                     # range read, tenant + public (Task 7)
src/occasions/occasion.service.spec.ts
src/occasions/occasion.module.ts                      # (Task 7)

src/calendar/calendar.types.ts                        # CalendarEntry, CalendarEntryType (Task 4)
src/calendar/dto/get-calendar.dto.ts                  # GET /calendar query DTO (Task 9)
src/calendar/calendar.service.ts                      # merge occasions + posts (Task 9)
src/calendar/calendar.service.spec.ts
src/calendar/calendar.controller.ts                   # GET /calendar (Task 9)
src/calendar/calendar.controller.spec.ts
src/calendar/calendar.module.ts                       # (Task 9)
```

**Decomposition rationale:** Shared, dependency-free units come first (migration → errors → state machine → types). Then `PostService`/`PostController` (list, then patch — patch is the write hot-path and earns its own task). Then `OccasionService`. `CalendarService` last because it composes posts + occasions. The seeder is independent of the request path and slots after occasion types are fixed.

---

### Task 1: SaudiOccasion model + migration

**Status:** ✅ Merged to main

**Files:**
- Modify: `prisma/schema.prisma` (append new model after `Subscription`, near the phase-local-tables comment)
- Create: `prisma/migrations/<timestamp>_add_saudi_occasion/migration.sql` (generated by Prisma)

**Interfaces:**
- Consumes: `DATABASE_URL` and the generated Prisma client from the foundation plan.
- Produces: table `SaudiOccasion` with columns `id, tenantId, slug, kind, nameAr, nameEn, startDate, endDate, hijriYear, gregorianYear`; unique `(tenantId, slug, gregorianYear)`; indexes `(tenantId, startDate, endDate)` and `(gregorianYear)`. Regenerated Prisma client exposing `prisma.saudiOccasion`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append (the spec mandates these exact fields and keys; `tenantId` is nullable so `null` rows are public occasions):

```prisma
model SaudiOccasion {
  id            String   @id @default(cuid())
  tenantId      String?  // null = public occasion shared by all tenants
  slug          String   // stable occasion identifier — the upsert key
  kind          String   // SaudiOccasionKind: national|foundation|ramadan|eid_fitr|eid_adha|commercial
  nameAr        String
  nameEn        String
  startDate     DateTime
  endDate       DateTime
  hijriYear     Int
  gregorianYear Int

  // One occasion per (tenant, slug, gregorian year). Distinct slugs let
  // multiple commercial seasons coexist in the same year.
  @@unique([tenantId, slug, gregorianYear])
  @@index([tenantId, startDate, endDate])
  @@index([gregorianYear])
}
```

- [ ] **Step 2: Create the migration without applying engine changes**

Run: `npx prisma migrate dev --name add_saudi_occasion`
Expected: a new folder `prisma/migrations/<timestamp>_add_saudi_occasion/` is created, the migration applies cleanly, and the Prisma client regenerates. Only `SaudiOccasion` should appear in `migration.sql` (no edits to existing tables).

- [ ] **Step 3: Verify the generated SQL touches only the new table**

Run: `grep -c "CREATE TABLE" prisma/migrations/*add_saudi_occasion*/migration.sql`
Expected: `1` (only `SaudiOccasion`). Confirm no `ALTER TABLE "Post"` lines exist:
Run: `grep -c "ALTER TABLE \"Post\"" prisma/migrations/*add_saudi_occasion*/migration.sql || true`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add SaudiOccasion model and migration"
```

---

### Task 2: Error envelope (AppError + ErrorCode → HTTP)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/common/errors/app-error.ts`
- Test: `src/common/errors/app-error.spec.ts`

**Interfaces:**
- Produces:
  - `type ErrorCode = 'VALIDATION_FAILED' | 'RANGE_TOO_WIDE' | 'INVALID_TRANSITION' | 'CONTENT_LOCKED' | 'NOT_FOUND' | 'PUBLISH_NOT_ALLOWED_HERE'`
  - `class AppError extends HttpException` with constructor `(code: ErrorCode, message: string)` that sets the right HTTP status and a `{ code, message }` body.
  - `ERROR_STATUS: Record<ErrorCode, number>`.
- Consumes: `@nestjs/common` `HttpException`.

- [ ] **Step 1: Write the failing test**

```ts
import { AppError, ERROR_STATUS } from './app-error';

describe('AppError', () => {
  it('maps every error code to its spec HTTP status', () => {
    expect(ERROR_STATUS).toEqual({
      VALIDATION_FAILED: 400,
      RANGE_TOO_WIDE: 400,
      INVALID_TRANSITION: 409,
      CONTENT_LOCKED: 409,
      NOT_FOUND: 404,
      PUBLISH_NOT_ALLOWED_HERE: 422,
    });
  });

  it('builds a { code, message } body with the mapped status', () => {
    const err = new AppError('NOT_FOUND', 'البوست غير موجود');
    expect(err.getStatus()).toBe(404);
    expect(err.getResponse()).toEqual({ code: 'NOT_FOUND', message: 'البوست غير موجود' });
  });

  it('maps PUBLISH_NOT_ALLOWED_HERE to 422', () => {
    const err = new AppError('PUBLISH_NOT_ALLOWED_HERE', 'النشر في المرحلة ٥');
    expect(err.getStatus()).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app-error`
Expected: FAIL — cannot find `./app-error`.

- [ ] **Step 3: Implement the error envelope**

```ts
import { HttpException } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'RANGE_TOO_WIDE'
  | 'INVALID_TRANSITION'
  | 'CONTENT_LOCKED'
  | 'NOT_FOUND'
  | 'PUBLISH_NOT_ALLOWED_HERE';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  RANGE_TOO_WIDE: 400,
  INVALID_TRANSITION: 409,
  CONTENT_LOCKED: 409,
  NOT_FOUND: 404,
  PUBLISH_NOT_ALLOWED_HERE: 422,
};

export class AppError extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super({ code, message }, ERROR_STATUS[code]);
    this.code = code;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app-error`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/common/errors
git commit -m "feat: add AppError envelope with spec error-code to HTTP mapping"
```

---

### Task 3: PostStateMachine (pure, DB-free)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/posts/post-state-machine.ts`
- Test: `src/posts/post-state-machine.spec.ts`

**Interfaces:**
- Produces:
  - `type PostStatus = 'draft' | 'pending_review' | 'approved' | 'published'`
  - `interface PostStatusTransition { from: PostStatus; to: PostStatus; }`
  - `const ALLOWED_TRANSITIONS: readonly PostStatusTransition[]`
  - `class PostStateMachine` with:
    - `isAllowed(from: PostStatus, to: PostStatus): boolean`
    - `assertTransition(currentStatus: PostStatus, transition: PostStatusTransition): void` — throws `AppError('PUBLISH_NOT_ALLOWED_HERE', …)` for any `→published`, `AppError('INVALID_TRANSITION', …)` when `transition.from !== currentStatus` or the pair is not in `ALLOWED_TRANSITIONS`. Returns void on success. No DB, no I/O.
- Consumes: `AppError` (Task 2).

- [ ] **Step 1: Write the failing test (isolation + every allowed + rejections)**

```ts
import { PostStateMachine, ALLOWED_TRANSITIONS } from './post-state-machine';
import { AppError } from '../common/errors/app-error';

describe('PostStateMachine', () => {
  const sm = new PostStateMachine();

  it('is pure/DB-free: ALLOWED_TRANSITIONS holds exactly the four spec pairs', () => {
    expect(ALLOWED_TRANSITIONS).toEqual([
      { from: 'draft', to: 'pending_review' },
      { from: 'pending_review', to: 'approved' },
      { from: 'pending_review', to: 'draft' },
      { from: 'approved', to: 'pending_review' },
    ]);
  });

  it('accepts each allowed transition when from matches current status', () => {
    for (const t of ALLOWED_TRANSITIONS) {
      expect(() => sm.assertTransition(t.from, t)).not.toThrow();
    }
  });

  it('isAllowed mirrors the table', () => {
    expect(sm.isAllowed('draft', 'pending_review')).toBe(true);
    expect(sm.isAllowed('approved', 'pending_review')).toBe(true);
    expect(sm.isAllowed('draft', 'approved')).toBe(false);
    expect(sm.isAllowed('draft', 'published')).toBe(false);
  });

  it('rejects a transition whose from does not match the current status', () => {
    try {
      sm.assertTransition('draft', { from: 'pending_review', to: 'approved' });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_TRANSITION');
      expect((e as AppError).getStatus()).toBe(409);
    }
  });

  it('rejects an undefined transition (draft -> approved) as INVALID_TRANSITION', () => {
    try {
      sm.assertTransition('draft', { from: 'draft', to: 'approved' });
      fail('expected throw');
    } catch (e) {
      expect((e as AppError).code).toBe('INVALID_TRANSITION');
    }
  });

  it('rejects any -> published with PUBLISH_NOT_ALLOWED_HERE (422), even from approved', () => {
    try {
      sm.assertTransition('approved', { from: 'approved', to: 'published' });
      fail('expected throw');
    } catch (e) {
      expect((e as AppError).code).toBe('PUBLISH_NOT_ALLOWED_HERE');
      expect((e as AppError).getStatus()).toBe(422);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- post-state-machine`
Expected: FAIL — cannot find `./post-state-machine`.

- [ ] **Step 3: Implement the state machine**

```ts
import { AppError } from '../common/errors/app-error';

export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'published';

export interface PostStatusTransition {
  from: PostStatus;
  to: PostStatus;
}

// The only transitions this phase owns. approved -> published belongs to Phase 5.
export const ALLOWED_TRANSITIONS: readonly PostStatusTransition[] = [
  { from: 'draft', to: 'pending_review' },
  { from: 'pending_review', to: 'approved' },
  { from: 'pending_review', to: 'draft' }, // reopen for more editing
  { from: 'approved', to: 'pending_review' }, // pull approval back before publishing
];

export class PostStateMachine {
  isAllowed(from: PostStatus, to: PostStatus): boolean {
    return ALLOWED_TRANSITIONS.some((t) => t.from === from && t.to === to);
  }

  // Pure validation. Throws AppError on rejection; returns void on success.
  assertTransition(currentStatus: PostStatus, transition: PostStatusTransition): void {
    if (transition.to === 'published') {
      throw new AppError(
        'PUBLISH_NOT_ALLOWED_HERE',
        'النشر يتم في المرحلة الخامسة، وليس من هنا',
      );
    }
    if (transition.from !== currentStatus) {
      throw new AppError(
        'INVALID_TRANSITION',
        'الحالة الحالية لا تطابق نقطة بداية الانتقال',
      );
    }
    if (!this.isAllowed(transition.from, transition.to)) {
      throw new AppError('INVALID_TRANSITION', 'انتقال غير مسموح به');
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- post-state-machine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/posts/post-state-machine.ts src/posts/post-state-machine.spec.ts
git commit -m "feat: add pure PostStateMachine with ALLOWED_TRANSITIONS"
```

---

### Task 4: Shared domain types (posts, occasions, calendar)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/posts/post.types.ts`
- Create: `src/occasions/occasion.types.ts`
- Create: `src/calendar/calendar.types.ts`
- Test: `src/calendar/calendar.types.spec.ts`

**Interfaces:**
- Produces:
  - `src/occasions/occasion.types.ts`: `type SaudiOccasionKind = 'national' | 'foundation' | 'ramadan' | 'eid_fitr' | 'eid_adha' | 'commercial'`; `const SAUDI_OCCASION_KINDS: readonly SaudiOccasionKind[]`; `interface SaudiOccasion { id; tenantId: string | null; slug; kind: SaudiOccasionKind; nameAr; nameEn; startDate: string; endDate: string; hijriYear: number; gregorianYear: number }`.
  - `src/posts/post.types.ts`: `interface CalendarPostSummary { id; platform: 'linkedin'|'x'; status: PostStatus; scheduledAt: string | null; excerpt: string; hasImage: boolean }`; `interface PostListItem { id; platform: 'linkedin'|'x'; status: PostStatus; scheduledAt: string | null; text: string; hashtags: string[]; hasImage: boolean; citationCount: number }`; `interface PostImage { url: string; method: string }`; `interface PostCitation { claim: string; sourceUrl: string }`; `interface PostDetail { id; tenantId: string; brandProfileId: string; platform: 'linkedin'|'x'; status: PostStatus; text: string; hashtags: string[]; scheduledAt: string | null; createdAt: string; image: PostImage | null; citations: PostCitation[] }`; `const EXCERPT_LENGTH = 120`.
  - `src/calendar/calendar.types.ts`: `type CalendarEntryType = 'occasion' | 'post'`; `interface CalendarEntry { type: CalendarEntryType; date: string; occasion?: SaudiOccasion; post?: CalendarPostSummary }`.
- Consumes: `PostStatus` (Task 3), `SaudiOccasion` (this task), `CalendarPostSummary` (this task).

- [ ] **Step 1: Write the failing test (kinds list is the contract)**

```ts
import { SAUDI_OCCASION_KINDS } from '../occasions/occasion.types';
import { EXCERPT_LENGTH } from '../posts/post.types';
import type { CalendarEntry } from './calendar.types';

describe('shared domain types', () => {
  it('exposes the six Saudi occasion kinds', () => {
    expect([...SAUDI_OCCASION_KINDS].sort()).toEqual(
      ['commercial', 'eid_adha', 'eid_fitr', 'foundation', 'national', 'ramadan'].sort(),
    );
  });

  it('excerpt length is 120', () => {
    expect(EXCERPT_LENGTH).toBe(120);
  });

  it('a post CalendarEntry has the expected shape', () => {
    const entry: CalendarEntry = {
      type: 'post',
      date: '2026-09-23',
      post: {
        id: 'p1',
        platform: 'x',
        status: 'approved',
        scheduledAt: '2026-09-23T09:00:00.000Z',
        excerpt: 'hi',
        hasImage: false,
      },
    };
    expect(entry.type).toBe('post');
    expect(entry.post?.id).toBe('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- calendar.types`
Expected: FAIL — cannot find the type modules.

- [ ] **Step 3: Implement `src/occasions/occasion.types.ts`**

```ts
export type SaudiOccasionKind =
  | 'national'
  | 'foundation'
  | 'ramadan'
  | 'eid_fitr'
  | 'eid_adha'
  | 'commercial';

export const SAUDI_OCCASION_KINDS: readonly SaudiOccasionKind[] = [
  'national',
  'foundation',
  'ramadan',
  'eid_fitr',
  'eid_adha',
  'commercial',
];

export interface SaudiOccasion {
  id: string;
  tenantId: string | null; // null = public occasion for all tenants
  slug: string;
  kind: SaudiOccasionKind;
  nameAr: string;
  nameEn: string;
  startDate: string; // ISO date
  endDate: string; // ISO date — equals startDate for single-day occasions
  hijriYear: number;
  gregorianYear: number;
}
```

- [ ] **Step 4: Implement `src/posts/post.types.ts`**

```ts
import type { PostStatus } from './post-state-machine';

export const EXCERPT_LENGTH = 120;

export type PostPlatform = 'linkedin' | 'x';

export interface CalendarPostSummary {
  id: string;
  platform: PostPlatform;
  status: PostStatus;
  scheduledAt: string | null;
  excerpt: string; // first ~120 chars of text
  hasImage: boolean;
}

export interface PostListItem {
  id: string;
  platform: PostPlatform;
  status: PostStatus;
  scheduledAt: string | null;
  text: string;
  hashtags: string[];
  hasImage: boolean;
  citationCount: number;
}

export interface PostImage {
  url: string;
  method: string;
}

export interface PostCitation {
  claim: string;
  sourceUrl: string;
}

export interface PostDetail {
  id: string;
  tenantId: string;
  brandProfileId: string;
  platform: PostPlatform;
  status: PostStatus;
  text: string;
  hashtags: string[];
  scheduledAt: string | null;
  createdAt: string;
  image: PostImage | null;
  citations: PostCitation[];
}
```

- [ ] **Step 5: Implement `src/calendar/calendar.types.ts`**

```ts
import type { SaudiOccasion } from '../occasions/occasion.types';
import type { CalendarPostSummary } from '../posts/post.types';

export type CalendarEntryType = 'occasion' | 'post';

export interface CalendarEntry {
  type: CalendarEntryType;
  date: string; // ISO date the entry appears on
  occasion?: SaudiOccasion; // set when type === 'occasion'
  post?: CalendarPostSummary; // set when type === 'post'
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- calendar.types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/posts/post.types.ts src/occasions/occasion.types.ts src/calendar/calendar.types.ts src/calendar/calendar.types.spec.ts
git commit -m "feat: add shared post, occasion, and calendar domain types"
```

---

### Task 5: PostService.list + GET /posts (filtered, paginated)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/posts/dto/list-posts.dto.ts`
- Create: `src/posts/post.service.ts`
- Create: `src/posts/post.controller.ts`
- Create: `src/posts/post.module.ts`
- Test: `src/posts/post.service.spec.ts`
- Test: `src/posts/post.controller.spec.ts`
- Modify: `src/app.module.ts` (register `PostModule`)

**Interfaces:**
- Produces:
  - `interface ListPostsParams { status?: PostStatus; platform?: PostPlatform; from?: string; to?: string; page?: number; pageSize?: number }`
  - `interface ListPostsResult { items: PostListItem[]; page: number; pageSize: number; total: number }`
  - `class ListPostsDto` (validated query) with the same optional fields, `page` default `1`, `pageSize` default `20` (max `100`).
  - `PostService.list(tenantId: string, params: ListPostsParams): Promise<ListPostsResult>`
  - `class PostController` with `@Get()` (`GET /posts`) reading `@CurrentTenant()`.
  - `PostModule` exporting `PostService`.
- Consumes: `PrismaService` (foundation), `PostListItem`/`PostPlatform`/`EXCERPT_LENGTH` (Task 4), `PostStatus` (Task 3), `AppError` (Task 2), `@CurrentTenant()`/`TenantContext`/`JwtAuthGuard`/`TenantGuard` (Phase 3).

- [ ] **Step 1: Write the failing service test**

```ts
import { Test } from '@nestjs/testing';
import { PostService } from './post.service';
import { PrismaService } from '../prisma/prisma.service';

const tenantId = 't1';

function makePrisma(rows: any[], total: number) {
  return {
    post: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(total),
    },
  };
}

describe('PostService.list', () => {
  it('scopes by tenantId, maps rows to PostListItem, returns pagination meta', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'p1',
          platform: 'x',
          status: 'draft',
          scheduledAt: new Date('2026-09-23T09:00:00.000Z'),
          text: 'hello world',
          hashtags: ['#a'],
          image: { id: 'img1' },
          _count: { citations: 2 },
        },
      ],
      1,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { status: 'draft', page: 1, pageSize: 20 });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId, status: 'draft' }) }),
    );
    expect(res).toEqual({
      items: [
        {
          id: 'p1',
          platform: 'x',
          status: 'draft',
          scheduledAt: '2026-09-23T09:00:00.000Z',
          text: 'hello world',
          hashtags: ['#a'],
          hasImage: true,
          citationCount: 2,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('clamps pageSize to 100 and defaults page/pageSize', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { pageSize: 500 });

    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(100);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, skip: 0 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- post.service`
Expected: FAIL — cannot find `./post.service`.

- [ ] **Step 3: Implement `src/posts/post.service.ts` (list only)**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostStatus } from './post-state-machine';
import { PostListItem, PostPlatform, EXCERPT_LENGTH } from './post.types';

export interface ListPostsParams {
  status?: PostStatus;
  platform?: PostPlatform;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPostsResult {
  items: PostListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class PostService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, params: ListPostsParams): Promise<ListPostsResult> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = Math.min(
      params.pageSize && params.pageSize > 0 ? params.pageSize : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const where: Record<string, unknown> = { tenantId };
    if (params.status) where.status = params.status;
    if (params.platform) where.platform = params.platform;
    if (params.from || params.to) {
      const scheduledAt: Record<string, Date> = {};
      if (params.from) scheduledAt.gte = new Date(params.from);
      if (params.to) scheduledAt.lte = new Date(params.to);
      where.scheduledAt = scheduledAt;
    }

    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { image: true, _count: { select: { citations: true } } },
        // scheduledAt ascending, nulls last, then createdAt descending
        orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      items: rows.map((r: any) => this.toListItem(r)),
      page,
      pageSize,
      total,
    };
  }

  private toListItem(row: any): PostListItem {
    return {
      id: row.id,
      platform: row.platform as PostPlatform,
      status: row.status as PostStatus,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      text: row.text,
      hashtags: row.hashtags,
      hasImage: !!row.image,
      citationCount: row._count?.citations ?? 0,
    };
  }
}

export { EXCERPT_LENGTH };
```

- [ ] **Step 4: Run service test to verify it passes**

Run: `npm test -- post.service`
Expected: PASS.

- [ ] **Step 5: Write the failing controller test**

```ts
import { Test } from '@nestjs/testing';
import { PostController } from './post.controller';
import { PostService } from './post.service';

describe('PostController GET /posts', () => {
  it('passes tenantId from context and parsed query to the service', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const moduleRef = await Test.createTestingModule({
      controllers: [PostController],
      providers: [{ provide: PostService, useValue: { list } }],
    }).compile();
    const ctrl = moduleRef.get(PostController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const query = { status: 'draft', page: 2, pageSize: 50 } as any;
    const res = await ctrl.list(ctx as any, query);

    expect(list).toHaveBeenCalledWith('t1', query);
    expect(res).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });
});
```

- [ ] **Step 6: Run controller test to verify it fails**

Run: `npm test -- post.controller`
Expected: FAIL — cannot find `./post.controller`.

- [ ] **Step 7: Implement the DTO**

`src/posts/dto/list-posts.dto.ts` (install validation deps if not present from foundation: `npm i class-validator class-transformer`):

```ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { PostStatus } from '../post-state-machine';
import { PostPlatform } from '../post.types';

const POST_STATUSES: PostStatus[] = ['draft', 'pending_review', 'approved', 'published'];
const PLATFORMS: PostPlatform[] = ['linkedin', 'x'];

export class ListPostsDto {
  @IsOptional()
  @IsIn(POST_STATUSES)
  status?: PostStatus;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: PostPlatform;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
```

- [ ] **Step 8: Implement the controller and module**

`src/posts/post.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PostService } from './post.service';
import { ListPostsDto } from './dto/list-posts.dto';
import { CurrentTenant, TenantContext } from '../auth/current-tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('posts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  list(@CurrentTenant() ctx: TenantContext, @Query() query: ListPostsDto) {
    return this.postService.list(ctx.tenantId, query);
  }
}
```

`src/posts/post.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { PostStateMachine } from './post-state-machine';

@Module({
  controllers: [PostController],
  providers: [PostService, PostStateMachine],
  exports: [PostService],
})
export class PostModule {}
```

> Note: import paths `../auth/current-tenant.decorator`, `../auth/jwt-auth.guard`, `../auth/tenant.guard` are the Phase 3 artifacts assumed to exist. `TenantContext = { userId: string; tenantId: string }`. If Phase 3 placed them elsewhere, adjust the import paths only — the usage is unchanged.

- [ ] **Step 9: Register `PostModule` in `src/app.module.ts` imports**

Add `import { PostModule } from './posts/post.module';` and include `PostModule` in the `imports` array.

- [ ] **Step 10: Enable global validation pipe (if not already in foundation `main.ts`)**

Verify `src/main.ts` has `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, exceptionFactory: () => new AppError('VALIDATION_FAILED', 'بيانات غير صالحة') }))`. If absent, add it (import `ValidationPipe` from `@nestjs/common` and `AppError` from `./common/errors/app-error`). This makes DTO failures return the spec `VALIDATION_FAILED` envelope.

- [ ] **Step 11: Run all post tests to verify they pass**

Run: `npm test -- post.controller post.service`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/posts src/app.module.ts src/main.ts
git commit -m "feat: add GET /posts list with filtering and pagination"
```

---

### Task 6: PostService.getDetail + patch (atomic edit + transition) + PATCH /posts/:id

**Status:** ✅ Merged to main

**Files:**
- Create: `src/posts/dto/patch-post.dto.ts`
- Modify: `src/posts/post.service.ts` (add `getDetail` and `patch`)
- Modify: `src/posts/post.controller.ts` (add `@Patch(':id')`)
- Test: `src/posts/post.service.spec.ts` (append patch cases)
- Test: `src/posts/post.controller.spec.ts` (append patch case)

**Interfaces:**
- Produces:
  - `interface PatchImageInput { url: string; method: string }`
  - `interface PatchPostInput { text?: string; hashtags?: string[]; image?: PatchImageInput | null; scheduledAt?: string | null; transition?: PostStatusTransition }`
  - `class PatchPostDto` (validated body) mirroring `PatchPostInput`; `image` may be an object or explicit `null`; `scheduledAt` may be an ISO datetime or explicit `null`.
  - `PostService.getDetail(tenantId: string, id: string): Promise<PostDetail>` — throws `AppError('NOT_FOUND', …)` when missing or cross-tenant.
  - `PostService.patch(tenantId: string, id: string, input: PatchPostInput): Promise<PostDetail>`.
  - `PostController.patch(ctx, id, body): Promise<PostDetail>` (`PATCH /posts/:id`).
- Consumes: `PostStateMachine.assertTransition` (Task 3), `AppError` (Task 2), `PostDetail`/`PostImage`/`PostCitation` (Task 4), `PrismaService` (foundation).

- [ ] **Step 1: Write failing service tests for getDetail + patch**

Append to `src/posts/post.service.spec.ts`:

```ts
import { PostStateMachine } from './post-state-machine';
import { AppError } from '../common/errors/app-error';

function detailRow(over: Partial<any> = {}) {
  return {
    id: 'p1',
    tenantId: 't1',
    brandProfileId: 'b1',
    platform: 'x',
    status: 'draft',
    text: 'hello',
    hashtags: ['#a'],
    scheduledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    image: null,
    citations: [],
    ...over,
  };
}

async function buildService(prisma: any) {
  const moduleRef = await Test.createTestingModule({
    providers: [PostService, PostStateMachine, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(PostService);
}

describe('PostService.getDetail', () => {
  it('throws NOT_FOUND when the post does not exist for the tenant', async () => {
    const prisma = { post: { findFirst: jest.fn().mockResolvedValue(null) } };
    const svc = await buildService(prisma);
    await expect(svc.getDetail('t1', 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'missing', tenantId: 't1' } }),
    );
  });

  it('maps a row to PostDetail', async () => {
    const prisma = {
      post: {
        findFirst: jest.fn().mockResolvedValue(
          detailRow({
            image: { url: 'http://img', method: 'gpt-image' },
            citations: [{ claim: 'c', sourceUrl: 'http://s' }],
          }),
        ),
      },
    };
    const svc = await buildService(prisma);
    const d = await svc.getDetail('t1', 'p1');
    expect(d).toEqual({
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'hello',
      hashtags: ['#a'],
      scheduledAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      image: { url: 'http://img', method: 'gpt-image' },
      citations: [{ claim: 'c', sourceUrl: 'http://s' }],
    });
  });
});

describe('PostService.patch', () => {
  // Transaction stub: runs the callback with a tx client backed by the same mocks.
  function makeTxPrisma(current: any, afterUpdateRow: any) {
    const tx = {
      post: { update: jest.fn().mockResolvedValue({}) },
      imageAsset: { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      post: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(current) // load current (for transition + lock check)
          .mockResolvedValueOnce(afterUpdateRow), // re-read detail after write
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      __tx: tx,
    };
    return prisma;
  }

  it('rejects content edit on an approved post with CONTENT_LOCKED', async () => {
    const prisma = makeTxPrisma(detailRow({ status: 'approved' }), detailRow());
    const svc = await buildService(prisma);
    await expect(svc.patch('t1', 'p1', { text: 'new' })).rejects.toMatchObject({
      code: 'CONTENT_LOCKED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a disallowed transition with INVALID_TRANSITION and writes nothing', async () => {
    const prisma = makeTxPrisma(detailRow({ status: 'draft' }), detailRow());
    const svc = await buildService(prisma);
    await expect(
      svc.patch('t1', 'p1', { transition: { from: 'draft', to: 'approved' } }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects approved->published with PUBLISH_NOT_ALLOWED_HERE', async () => {
    const prisma = makeTxPrisma(detailRow({ status: 'approved' }), detailRow());
    const svc = await buildService(prisma);
    await expect(
      svc.patch('t1', 'p1', { transition: { from: 'approved', to: 'published' } }),
    ).rejects.toMatchObject({ code: 'PUBLISH_NOT_ALLOWED_HERE' });
  });

  it('throws NOT_FOUND for a cross-tenant id', async () => {
    const prisma = {
      post: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const svc = await buildService(prisma);
    await expect(svc.patch('t1', 'other', { text: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('applies edit + allowed transition atomically and returns the updated detail', async () => {
    const after = detailRow({ status: 'pending_review', text: 'edited' });
    const prisma = makeTxPrisma(detailRow({ status: 'draft' }), after);
    const svc = await buildService(prisma);
    const res = await svc.patch('t1', 'p1', {
      text: 'edited',
      transition: { from: 'draft', to: 'pending_review' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ text: 'edited', status: 'pending_review' }),
      }),
    );
    expect(res.status).toBe('pending_review');
    expect(res.text).toBe('edited');
  });

  it('sets scheduledAt and clears image when image is null', async () => {
    const after = detailRow({ scheduledAt: new Date('2026-09-23T09:00:00.000Z') });
    const prisma = makeTxPrisma(detailRow({ status: 'draft' }), after);
    const svc = await buildService(prisma);
    await svc.patch('t1', 'p1', { scheduledAt: '2026-09-23T09:00:00.000Z', image: null });
    expect(prisma.__tx.imageAsset.deleteMany).toHaveBeenCalledWith({ where: { postId: 'p1' } });
    expect(prisma.__tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduledAt: new Date('2026-09-23T09:00:00.000Z') }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- post.service`
Expected: FAIL — `getDetail`/`patch` not defined.

- [ ] **Step 3: Implement `getDetail` and `patch` in `src/posts/post.service.ts`**

Add the constructor dependency on `PostStateMachine` and the new methods. Update the constructor and imports:

```ts
import { PostStateMachine, PostStatus, PostStatusTransition } from './post-state-machine';
import { AppError } from '../common/errors/app-error';
import {
  PostListItem,
  PostPlatform,
  PostDetail,
  PostImage,
  PostCitation,
  EXCERPT_LENGTH,
} from './post.types';
```

Constructor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: PostStateMachine,
  ) {}
```

Add these methods and helpers to the class:

```ts
  async getDetail(tenantId: string, id: string): Promise<PostDetail> {
    const row = await this.prisma.post.findFirst({
      where: { id, tenantId },
      include: { image: true, citations: true },
    });
    if (!row) {
      throw new AppError('NOT_FOUND', 'البوست غير موجود');
    }
    return this.toDetail(row);
  }

  async patch(tenantId: string, id: string, input: PatchPostInput): Promise<PostDetail> {
    const current = await this.prisma.post.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new AppError('NOT_FOUND', 'البوست غير موجود');
    }

    const editsContent =
      input.text !== undefined || input.hashtags !== undefined || input.image !== undefined;

    // Content is locked once approved; it must be pulled back to pending_review first.
    if (editsContent && current.status === 'approved') {
      throw new AppError('CONTENT_LOCKED', 'لا يمكن تعديل محتوى بوست معتمد');
    }

    // Validate the transition against the actual current status BEFORE any write.
    if (input.transition) {
      this.stateMachine.assertTransition(current.status as PostStatus, input.transition);
    }

    // Build the Post.update data payload.
    const data: Record<string, unknown> = {};
    if (input.text !== undefined) data.text = input.text;
    if (input.hashtags !== undefined) data.hashtags = input.hashtags;
    if (input.scheduledAt !== undefined) {
      data.scheduledAt = input.scheduledAt === null ? null : new Date(input.scheduledAt);
    }
    if (input.transition) data.status = input.transition.to;

    // Edit + transition + image are one atomic transaction.
    await this.prisma.$transaction(async (tx: any) => {
      if (Object.keys(data).length > 0) {
        await tx.post.update({ where: { id }, data });
      }
      if (input.image !== undefined) {
        if (input.image === null) {
          await tx.imageAsset.deleteMany({ where: { postId: id } });
        } else {
          await tx.imageAsset.upsert({
            where: { postId: id },
            create: { postId: id, url: input.image.url, method: input.image.method },
            update: { url: input.image.url, method: input.image.method },
          });
        }
      }
    });

    return this.getDetail(tenantId, id);
  }

  private toDetail(row: any): PostDetail {
    const image: PostImage | null = row.image
      ? { url: row.image.url, method: row.image.method }
      : null;
    const citations: PostCitation[] = (row.citations ?? []).map((c: any) => ({
      claim: c.claim,
      sourceUrl: c.sourceUrl,
    }));
    return {
      id: row.id,
      tenantId: row.tenantId,
      brandProfileId: row.brandProfileId,
      platform: row.platform as PostPlatform,
      status: row.status as PostStatus,
      text: row.text,
      hashtags: row.hashtags,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      image,
      citations,
    };
  }
```

Add the input types near the top of the file (after `ListPostsResult`):

```ts
export interface PatchImageInput {
  url: string;
  method: string;
}

export interface PatchPostInput {
  text?: string;
  hashtags?: string[];
  image?: PatchImageInput | null;
  scheduledAt?: string | null;
  transition?: PostStatusTransition;
}
```

> The `getDetail` re-read after the transaction is what makes the second `findFirst` mock fire in the tests. `excerpt`/`EXCERPT_LENGTH` is used by the calendar mapper (Task 9), not here.

- [ ] **Step 4: Run service tests to verify they pass**

Run: `npm test -- post.service`
Expected: PASS.

- [ ] **Step 5: Implement the PATCH DTO**

`src/posts/dto/patch-post.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PostStatus } from '../post-state-machine';

const POST_STATUSES: PostStatus[] = ['draft', 'pending_review', 'approved', 'published'];

class TransitionDto {
  @IsIn(POST_STATUSES)
  from!: PostStatus;

  @IsIn(POST_STATUSES)
  to!: PostStatus;
}

class ImageDto {
  @IsString()
  url!: string;

  @IsString()
  method!: string;
}

export class PatchPostDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  // null clears the image; an object creates/updates it. undefined leaves it untouched.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ImageDto)
  image?: ImageDto | null;

  // null clears the reminder; an ISO datetime sets it. undefined leaves it untouched.
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransitionDto)
  transition?: TransitionDto;
}
```

> `@IsOptional()` treats `null` as "skip remaining validators", so explicit `null` for `image`/`scheduledAt` passes through to the service, which distinguishes `undefined` (untouched) from `null` (clear).

- [ ] **Step 6: Write the failing controller test for PATCH**

Append to `src/posts/post.controller.spec.ts`:

```ts
describe('PostController PATCH /posts/:id', () => {
  it('passes tenantId, id, and body to the service', async () => {
    const patch = jest.fn().mockResolvedValue({ id: 'p1', status: 'pending_review' });
    const moduleRef = await Test.createTestingModule({
      controllers: [PostController],
      providers: [{ provide: PostService, useValue: { patch, list: jest.fn() } }],
    }).compile();
    const ctrl = moduleRef.get(PostController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const body = { transition: { from: 'draft', to: 'pending_review' } } as any;
    const res = await ctrl.patch(ctx as any, 'p1', body);

    expect(patch).toHaveBeenCalledWith('t1', 'p1', body);
    expect(res).toEqual({ id: 'p1', status: 'pending_review' });
  });
});
```

- [ ] **Step 7: Run controller test to verify it fails**

Run: `npm test -- post.controller`
Expected: FAIL — `ctrl.patch` is not a function.

- [ ] **Step 8: Add the PATCH handler to `src/posts/post.controller.ts`**

Add imports `Param`, `Patch`, `Body` to the `@nestjs/common` import and `PatchPostDto`:

```ts
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PatchPostDto } from './dto/patch-post.dto';
```

Add the method:

```ts
  @Patch(':id')
  patch(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: PatchPostDto,
  ) {
    return this.postService.patch(ctx.tenantId, id, body);
  }
```

- [ ] **Step 9: Run all post tests to verify they pass**

Run: `npm test -- post.controller post.service`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/posts
git commit -m "feat: add PATCH /posts/:id atomic edit + state transition"
```

---

### Task 7: OccasionService + module (range read, public + tenant)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/occasions/occasion.service.ts`
- Create: `src/occasions/occasion.module.ts`
- Test: `src/occasions/occasion.service.spec.ts`

**Interfaces:**
- Produces:
  - `interface FindOccasionsParams { from: string; to: string; kind?: SaudiOccasionKind }`
  - `OccasionService.findInRange(tenantId: string, params: FindOccasionsParams): Promise<SaudiOccasion[]>` — returns public (`tenantId = null`) + this tenant's occasions that overlap `[from, to]`, sorted by `startDate` ascending, mapped to the `SaudiOccasion` domain type (ISO date strings).
  - `OccasionModule` exporting `OccasionService`.
- Consumes: `PrismaService` (foundation), `SaudiOccasion`/`SaudiOccasionKind` (Task 4).

- [ ] **Step 1: Write the failing service test**

```ts
import { Test } from '@nestjs/testing';
import { OccasionService } from './occasion.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OccasionService.findInRange', () => {
  it('queries public + tenant occasions overlapping the range and maps to ISO dates', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'o1',
        tenantId: null,
        slug: 'saudi-national-day',
        kind: 'national',
        nameAr: 'اليوم الوطني',
        nameEn: 'National Day',
        startDate: new Date('2026-09-23T00:00:00.000Z'),
        endDate: new Date('2026-09-23T00:00:00.000Z'),
        hijriYear: 1448,
        gregorianYear: 2026,
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: { saudiOccasion: { findMany } } }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    const res = await svc.findInRange('t1', { from: '2026-09-01', to: '2026-09-30' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ tenantId: null }, { tenantId: 't1' }],
          startDate: { lte: new Date('2026-09-30') },
          endDate: { gte: new Date('2026-09-01') },
        },
        orderBy: { startDate: 'asc' },
      }),
    );
    expect(res[0]).toEqual({
      id: 'o1',
      tenantId: null,
      slug: 'saudi-national-day',
      kind: 'national',
      nameAr: 'اليوم الوطني',
      nameEn: 'National Day',
      startDate: '2026-09-23',
      endDate: '2026-09-23',
      hijriYear: 1448,
      gregorianYear: 2026,
    });
  });

  it('adds a kind filter when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: { saudiOccasion: { findMany } } }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    await svc.findInRange('t1', { from: '2026-01-01', to: '2026-02-01', kind: 'commercial' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ kind: 'commercial' }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- occasion.service`
Expected: FAIL — cannot find `./occasion.service`.

- [ ] **Step 3: Implement the service and module**

`src/occasions/occasion.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaudiOccasion, SaudiOccasionKind } from './occasion.types';

export interface FindOccasionsParams {
  from: string;
  to: string;
  kind?: SaudiOccasionKind;
}

@Injectable()
export class OccasionService {
  constructor(private readonly prisma: PrismaService) {}

  async findInRange(tenantId: string, params: FindOccasionsParams): Promise<SaudiOccasion[]> {
    const from = new Date(params.from);
    const to = new Date(params.to);

    const where: Record<string, unknown> = {
      OR: [{ tenantId: null }, { tenantId }],
      // overlap test: occasion.start <= range.to AND occasion.end >= range.from
      startDate: { lte: to },
      endDate: { gte: from },
    };
    if (params.kind) where.kind = params.kind;

    const rows = await this.prisma.saudiOccasion.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });

    return rows.map((r: any) => this.toDomain(r));
  }

  private toDomain(row: any): SaudiOccasion {
    return {
      id: row.id,
      tenantId: row.tenantId,
      slug: row.slug,
      kind: row.kind as SaudiOccasionKind,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      hijriYear: row.hijriYear,
      gregorianYear: row.gregorianYear,
    };
  }
}
```

`src/occasions/occasion.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OccasionService } from './occasion.service';

@Module({
  providers: [OccasionService],
  exports: [OccasionService],
})
export class OccasionModule {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- occasion.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/occasions
git commit -m "feat: add OccasionService range read (public + tenant occasions)"
```

---

### Task 8: HijriOccasionSeeder (idempotent seed script)

**Status:** ✅ Merged to main

**Files:**
- Create: `prisma/seeds/occasion-definitions.ts`
- Create: `prisma/seeds/hijri-occasion.seeder.ts`
- Test: `prisma/seeds/hijri-occasion.seeder.spec.ts`
- Modify: `package.json` (add `seed:occasions` script)

**Interfaces:**
- Produces:
  - `interface OccasionRowInput { tenantId: string | null; slug: string; kind: SaudiOccasionKind; nameAr: string; nameEn: string; startDate: Date; endDate: Date; hijriYear: number; gregorianYear: number }`
  - `buildOccasionRows(gregorianYear: number): OccasionRowInput[]` — pure function producing the six-kind public occasion set (fixed-Gregorian national/foundation, Hijri-derived ramadan/eid_fitr/eid_adha, and the three commercial seasons), each with a distinct `slug`.
  - `seedOccasions(prisma: { saudiOccasion: { upsert(args): Promise<unknown> } }, gregorianYear: number): Promise<number>` — upserts each row on `(tenantId, slug, gregorianYear)`, returns the row count. Idempotent.
- Consumes: `moment-hijri` (install: `npm i -D moment-hijri @types/moment-hijri`), `SaudiOccasionKind` (Task 4).

- [ ] **Step 1: Write the failing test**

`prisma/seeds/hijri-occasion.seeder.spec.ts`:

```ts
import { buildOccasionRows, seedOccasions } from './hijri-occasion.seeder';

describe('buildOccasionRows', () => {
  const rows = buildOccasionRows(2026);

  it('covers all six occasion kinds', () => {
    const kinds = new Set(rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(
      ['commercial', 'eid_adha', 'eid_fitr', 'foundation', 'national', 'ramadan'].sort(),
    );
  });

  it('every row is public, carries the target gregorian year, and uses a distinct slug', () => {
    const slugs = rows.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const r of rows) {
      expect(r.tenantId).toBeNull();
      expect(r.gregorianYear).toBe(2026);
    }
  });

  it('national day is fixed Gregorian Sep 23', () => {
    const nat = rows.find((r) => r.slug === 'saudi-national-day')!;
    expect(nat.startDate.getUTCMonth()).toBe(8); // September (0-based)
    expect(nat.startDate.getUTCDate()).toBe(23);
  });

  it('foundation day is fixed Gregorian Feb 22', () => {
    const f = rows.find((r) => r.slug === 'saudi-foundation-day')!;
    expect(f.startDate.getUTCMonth()).toBe(1); // February
    expect(f.startDate.getUTCDate()).toBe(22);
  });

  it('includes the three distinct commercial seasons', () => {
    const commercialSlugs = rows.filter((r) => r.kind === 'commercial').map((r) => r.slug).sort();
    expect(commercialSlugs).toEqual(['back-to-school', 'white-friday', 'year-end-sale']);
  });

  it('ramadan is a multi-day range (endDate after startDate)', () => {
    const r = rows.find((x) => x.slug === 'ramadan')!;
    expect(r.endDate.getTime()).toBeGreaterThan(r.startDate.getTime());
  });
});

describe('seedOccasions', () => {
  it('upserts each row on (tenantId, slug, gregorianYear) and is idempotent', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { saudiOccasion: { upsert } };

    const n1 = await seedOccasions(prisma, 2026);
    const n2 = await seedOccasions(prisma, 2026);

    expect(n1).toBe(n2); // same count both runs
    const firstArgs = upsert.mock.calls[0][0];
    expect(firstArgs.where).toHaveProperty('tenantId_slug_gregorianYear');
    expect(firstArgs).toHaveProperty('create');
    expect(firstArgs).toHaveProperty('update');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hijri-occasion.seeder`
Expected: FAIL — cannot find `./hijri-occasion.seeder`.

- [ ] **Step 3: Implement `prisma/seeds/occasion-definitions.ts`**

```ts
import type { SaudiOccasionKind } from '../../src/occasions/occasion.types';

// Hijri month/day anchors converted to Gregorian by the seeder.
export interface HijriAnchor {
  slug: string;
  kind: SaudiOccasionKind;
  nameAr: string;
  nameEn: string;
  hMonth: number; // 1-based Hijri month
  hDay: number; // 1-based Hijri day
  durationDays: number; // inclusive span; 1 = single day
}

// Fixed-Gregorian occasions (no Hijri conversion).
export interface GregorianFixed {
  slug: string;
  kind: SaudiOccasionKind;
  nameAr: string;
  nameEn: string;
  month: number; // 1-based Gregorian month
  day: number;
  durationDays: number;
}

export const HIJRI_ANCHORS: HijriAnchor[] = [
  {
    slug: 'ramadan',
    kind: 'ramadan',
    nameAr: 'شهر رمضان',
    nameEn: 'Ramadan',
    hMonth: 9, // Ramadan
    hDay: 1,
    durationDays: 30,
  },
  {
    slug: 'eid-al-fitr',
    kind: 'eid_fitr',
    nameAr: 'عيد الفطر',
    nameEn: 'Eid al-Fitr',
    hMonth: 10, // Shawwal
    hDay: 1,
    durationDays: 3,
  },
  {
    slug: 'eid-al-adha',
    kind: 'eid_adha',
    nameAr: 'عيد الأضحى',
    nameEn: 'Eid al-Adha',
    hMonth: 12, // Dhu al-Hijjah
    hDay: 10,
    durationDays: 4,
  },
];

export const GREGORIAN_FIXED: GregorianFixed[] = [
  {
    slug: 'saudi-national-day',
    kind: 'national',
    nameAr: 'اليوم الوطني السعودي',
    nameEn: 'Saudi National Day',
    month: 9,
    day: 23,
    durationDays: 1,
  },
  {
    slug: 'saudi-foundation-day',
    kind: 'foundation',
    nameAr: 'يوم التأسيس',
    nameEn: 'Saudi Foundation Day',
    month: 2,
    day: 22,
    durationDays: 1,
  },
  {
    slug: 'back-to-school',
    kind: 'commercial',
    nameAr: 'موسم العودة إلى المدارس',
    nameEn: 'Back to School',
    month: 8,
    day: 15,
    durationDays: 21,
  },
  {
    slug: 'white-friday',
    kind: 'commercial',
    nameAr: 'الجمعة البيضاء',
    nameEn: 'White Friday',
    month: 11,
    day: 24,
    durationDays: 4,
  },
  {
    slug: 'year-end-sale',
    kind: 'commercial',
    nameAr: 'تخفيضات نهاية العام',
    nameEn: 'Year-End Sale',
    month: 12,
    day: 20,
    durationDays: 12,
  },
];
```

- [ ] **Step 4: Implement `prisma/seeds/hijri-occasion.seeder.ts`**

```ts
import moment from 'moment-hijri';
import type { SaudiOccasionKind } from '../../src/occasions/occasion.types';
import { GREGORIAN_FIXED, HIJRI_ANCHORS } from './occasion-definitions';

export interface OccasionRowInput {
  tenantId: string | null;
  slug: string;
  kind: SaudiOccasionKind;
  nameAr: string;
  nameEn: string;
  startDate: Date;
  endDate: Date;
  hijriYear: number;
  gregorianYear: number;
}

function utcDate(year: number, month1: number, day: number): Date {
  // month1 is 1-based; Date.UTC takes 0-based month.
  return new Date(Date.UTC(year, month1 - 1, day, 0, 0, 0, 0));
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// Find the Hijri year whose (hMonth, hDay) lands inside the target Gregorian year.
function hijriAnchorToGregorian(
  hMonth: number,
  hDay: number,
  gregorianYear: number,
): { start: Date; hijriYear: number } | null {
  // A Gregorian year overlaps two Hijri years; try both candidates.
  const approxHijriYear = Math.floor((gregorianYear - 622) * (33 / 32));
  for (const hYear of [approxHijriYear - 1, approxHijriYear, approxHijriYear + 1]) {
    // moment-hijri month is 0-based.
    const m = moment(`${hYear}-${hMonth - 1}-${hDay}`, 'iYYYY-iM-iD');
    if (!m.isValid()) continue;
    const g = m.toDate();
    if (g.getUTCFullYear() === gregorianYear) {
      return { start: utcDate(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate()), hijriYear: hYear };
    }
  }
  return null;
}

export function buildOccasionRows(gregorianYear: number): OccasionRowInput[] {
  const rows: OccasionRowInput[] = [];

  // Fixed Gregorian occasions (national, foundation, commercial seasons).
  for (const f of GREGORIAN_FIXED) {
    const start = utcDate(gregorianYear, f.month, f.day);
    rows.push({
      tenantId: null,
      slug: f.slug,
      kind: f.kind,
      nameAr: f.nameAr,
      nameEn: f.nameEn,
      startDate: start,
      endDate: addDays(start, f.durationDays - 1),
      hijriYear: 0, // not Hijri-derived
      gregorianYear,
    });
  }

  // Hijri-derived occasions (ramadan, eid_fitr, eid_adha).
  for (const a of HIJRI_ANCHORS) {
    const resolved = hijriAnchorToGregorian(a.hMonth, a.hDay, gregorianYear);
    if (!resolved) continue;
    rows.push({
      tenantId: null,
      slug: a.slug,
      kind: a.kind,
      nameAr: a.nameAr,
      nameEn: a.nameEn,
      startDate: resolved.start,
      endDate: addDays(resolved.start, a.durationDays - 1),
      hijriYear: resolved.hijriYear,
      gregorianYear,
    });
  }

  return rows;
}

export async function seedOccasions(
  prisma: { saudiOccasion: { upsert(args: unknown): Promise<unknown> } },
  gregorianYear: number,
): Promise<number> {
  const rows = buildOccasionRows(gregorianYear);
  for (const row of rows) {
    await prisma.saudiOccasion.upsert({
      where: {
        tenantId_slug_gregorianYear: {
          tenantId: row.tenantId,
          slug: row.slug,
          gregorianYear: row.gregorianYear,
        },
      },
      create: row,
      update: {
        kind: row.kind,
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        startDate: row.startDate,
        endDate: row.endDate,
        hijriYear: row.hijriYear,
      },
    });
  }
  return rows.length;
}

// CLI entrypoint: `npm run seed:occasions -- 2026`
if (require.main === module) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const year = Number(process.argv[2]) || new Date().getUTCFullYear();
  seedOccasions(prisma, year)
    .then((n) => {
      // eslint-disable-next-line no-console
      console.log(`Seeded ${n} occasions for ${year}`);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
```

> The Prisma compound-unique input key is `tenantId_slug_gregorianYear` (Prisma's auto-generated name for `@@unique([tenantId, slug, gregorianYear])`). The `update` payload intentionally omits the three unique-key fields so re-runs stay idempotent without changing identity.

- [ ] **Step 5: Add the seed script to `package.json`**

```json
"seed:occasions": "ts-node prisma/seeds/hijri-occasion.seeder.ts"
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- hijri-occasion.seeder`
Expected: PASS.

- [ ] **Step 7: Run the seeder against the dev DB (idempotency smoke check)**

Run: `npm run seed:occasions -- 2026 && npm run seed:occasions -- 2026`
Expected: prints `Seeded 8 occasions for 2026` both times, no unique-constraint error on the second run.

- [ ] **Step 8: Commit**

```bash
git add prisma/seeds package.json package-lock.json
git commit -m "feat: add idempotent HijriOccasionSeeder for Saudi occasions"
```

---

### Task 9: CalendarService + GET /calendar (merge occasions + scheduled posts, 92-day cap)

**Status:** ✅ Merged to main

**Files:**
- Create: `src/calendar/dto/get-calendar.dto.ts`
- Create: `src/calendar/calendar.service.ts`
- Create: `src/calendar/calendar.controller.ts`
- Create: `src/calendar/calendar.module.ts`
- Test: `src/calendar/calendar.service.spec.ts`
- Test: `src/calendar/calendar.controller.spec.ts`
- Modify: `src/app.module.ts` (register `CalendarModule`)

**Interfaces:**
- Produces:
  - `class GetCalendarDto` (validated query): `from!: string` (ISO date, required), `to!: string` (ISO date, required), `platform?: 'linkedin'|'x'`, `kind?: SaudiOccasionKind`.
  - `interface GetCalendarParams { from: string; to: string; platform?: PostPlatform; kind?: SaudiOccasionKind }`
  - `interface CalendarResult { entries: CalendarEntry[] }`
  - `const MAX_RANGE_DAYS = 92`
  - `CalendarService.getCalendar(tenantId: string, params: GetCalendarParams): Promise<CalendarResult>` — throws `AppError('RANGE_TOO_WIDE', …)` when `to - from > 92 days`; merges occasions (via `OccasionService`) + scheduled posts (via Prisma) into date-sorted `CalendarEntry[]`.
  - `CalendarController` with `@Get()` (`GET /calendar`).
  - `CalendarModule` importing `OccasionModule`.
- Consumes: `OccasionService.findInRange` (Task 7), `PrismaService` (foundation), `EXCERPT_LENGTH`/`CalendarPostSummary`/`PostPlatform` (Task 4), `CalendarEntry` (Task 4), `SaudiOccasionKind` (Task 4), `AppError` (Task 2), `PostStatus` (Task 3).

- [ ] **Step 1: Write the failing service test**

```ts
import { Test } from '@nestjs/testing';
import { CalendarService } from './calendar.service';
import { OccasionService } from '../occasions/occasion.service';
import { PrismaService } from '../prisma/prisma.service';

function build(occasions: any[], posts: any[]) {
  const findInRange = jest.fn().mockResolvedValue(occasions);
  const findMany = jest.fn().mockResolvedValue(posts);
  return Test.createTestingModule({
    providers: [
      CalendarService,
      { provide: OccasionService, useValue: { findInRange } },
      { provide: PrismaService, useValue: { post: { findMany } } },
    ],
  })
    .compile()
    .then((m) => ({ svc: m.get(CalendarService), findInRange, findMany }));
}

describe('CalendarService.getCalendar', () => {
  it('rejects a range wider than 92 days with RANGE_TOO_WIDE', async () => {
    const { svc } = await build([], []);
    await expect(
      svc.getCalendar('t1', { from: '2026-01-01', to: '2026-06-01' }),
    ).rejects.toMatchObject({ code: 'RANGE_TOO_WIDE' });
  });

  it('merges occasions + scheduled posts, date-sorted, scoped by tenant', async () => {
    const { svc, findMany } = await build(
      [
        {
          id: 'o1',
          tenantId: null,
          slug: 'saudi-national-day',
          kind: 'national',
          nameAr: 'اليوم الوطني',
          nameEn: 'National Day',
          startDate: '2026-09-23',
          endDate: '2026-09-23',
          hijriYear: 0,
          gregorianYear: 2026,
        },
      ],
      [
        {
          id: 'p1',
          platform: 'x',
          status: 'approved',
          scheduledAt: new Date('2026-09-20T09:00:00.000Z'),
          text: 'a'.repeat(200),
          image: { id: 'img' },
        },
      ],
    );

    const res = await svc.getCalendar('t1', { from: '2026-09-01', to: '2026-09-30' });

    // scoped + only posts with scheduledAt in range
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          scheduledAt: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') },
        }),
      }),
    );
    // sorted by date: post on 09-20 before occasion on 09-23
    expect(res.entries.map((e) => e.type)).toEqual(['post', 'occasion']);
    expect(res.entries[0].post?.excerpt.length).toBe(120);
    expect(res.entries[0].post?.hasImage).toBe(true);
    expect(res.entries[1].occasion?.slug).toBe('saudi-national-day');
  });

  it('passes platform and kind filters down to posts and occasions', async () => {
    const { svc, findInRange, findMany } = await build([], []);
    await svc.getCalendar('t1', {
      from: '2026-09-01',
      to: '2026-09-30',
      platform: 'linkedin',
      kind: 'national',
    });
    expect(findInRange).toHaveBeenCalledWith('t1', {
      from: '2026-09-01',
      to: '2026-09-30',
      kind: 'national',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ platform: 'linkedin' }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- calendar.service`
Expected: FAIL — cannot find `./calendar.service`.

- [ ] **Step 3: Implement the service**

`src/calendar/calendar.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OccasionService } from '../occasions/occasion.service';
import { AppError } from '../common/errors/app-error';
import { CalendarEntry } from './calendar.types';
import { SaudiOccasionKind } from '../occasions/occasion.types';
import { CalendarPostSummary, PostPlatform, EXCERPT_LENGTH } from '../posts/post.types';
import { PostStatus } from '../posts/post-state-machine';

export const MAX_RANGE_DAYS = 92;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface GetCalendarParams {
  from: string;
  to: string;
  platform?: PostPlatform;
  kind?: SaudiOccasionKind;
}

export interface CalendarResult {
  entries: CalendarEntry[];
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occasions: OccasionService,
  ) {}

  async getCalendar(tenantId: string, params: GetCalendarParams): Promise<CalendarResult> {
    const from = new Date(params.from);
    const to = new Date(params.to);

    const spanDays = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
    if (spanDays > MAX_RANGE_DAYS) {
      throw new AppError('RANGE_TOO_WIDE', 'الفترة تتجاوز الحد الأقصى (٩٢ يوماً)');
    }

    const [occasions, postRows] = await Promise.all([
      this.occasions.findInRange(tenantId, {
        from: params.from,
        to: params.to,
        kind: params.kind,
      }),
      this.fetchScheduledPosts(tenantId, from, to, params.platform),
    ]);

    const entries: CalendarEntry[] = [];

    for (const o of occasions) {
      entries.push({ type: 'occasion', date: o.startDate, occasion: o });
    }
    for (const row of postRows) {
      entries.push({
        type: 'post',
        date: row.scheduledAt.toISOString().slice(0, 10),
        post: this.toSummary(row),
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
    return { entries };
  }

  private fetchScheduledPosts(
    tenantId: string,
    from: Date,
    to: Date,
    platform?: PostPlatform,
  ): Promise<any[]> {
    const where: Record<string, unknown> = {
      tenantId,
      scheduledAt: { gte: from, lte: to },
    };
    if (platform) where.platform = platform;
    return this.prisma.post.findMany({
      where,
      include: { image: true },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  private toSummary(row: any): CalendarPostSummary {
    return {
      id: row.id,
      platform: row.platform as PostPlatform,
      status: row.status as PostStatus,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      excerpt: (row.text ?? '').slice(0, EXCERPT_LENGTH),
      hasImage: !!row.image,
    };
  }
}
```

- [ ] **Step 4: Run service test to verify it passes**

Run: `npm test -- calendar.service`
Expected: PASS.

- [ ] **Step 5: Implement the DTO**

`src/calendar/dto/get-calendar.dto.ts`:

```ts
import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { SaudiOccasionKind, SAUDI_OCCASION_KINDS } from '../../occasions/occasion.types';
import { PostPlatform } from '../../posts/post.types';

const PLATFORMS: PostPlatform[] = ['linkedin', 'x'];

export class GetCalendarDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: PostPlatform;

  @IsOptional()
  @IsIn(SAUDI_OCCASION_KINDS as SaudiOccasionKind[])
  kind?: SaudiOccasionKind;
}
```

> `from`/`to` are not `@IsOptional()`, so a missing one fails validation → `VALIDATION_FAILED` via the global pipe (Task 5 Step 10).

- [ ] **Step 6: Write the failing controller test**

`src/calendar/calendar.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

describe('CalendarController GET /calendar', () => {
  it('passes tenantId and query to the service', async () => {
    const getCalendar = jest.fn().mockResolvedValue({ entries: [] });
    const moduleRef = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [{ provide: CalendarService, useValue: { getCalendar } }],
    }).compile();
    const ctrl = moduleRef.get(CalendarController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const query = { from: '2026-09-01', to: '2026-09-30' } as any;
    const res = await ctrl.get(ctx as any, query);

    expect(getCalendar).toHaveBeenCalledWith('t1', query);
    expect(res).toEqual({ entries: [] });
  });
});
```

- [ ] **Step 7: Run controller test to verify it fails**

Run: `npm test -- calendar.controller`
Expected: FAIL — cannot find `./calendar.controller`.

- [ ] **Step 8: Implement the controller and module**

`src/calendar/calendar.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { GetCalendarDto } from './dto/get-calendar.dto';
import { CurrentTenant, TenantContext } from '../auth/current-tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('calendar')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  get(@CurrentTenant() ctx: TenantContext, @Query() query: GetCalendarDto) {
    return this.calendarService.getCalendar(ctx.tenantId, query);
  }
}
```

`src/calendar/calendar.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { OccasionModule } from '../occasions/occasion.module';

@Module({
  imports: [OccasionModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
```

- [ ] **Step 9: Register `CalendarModule` in `src/app.module.ts` imports**

Add `import { CalendarModule } from './calendar/calendar.module';` and include `CalendarModule` in the `imports` array.

- [ ] **Step 10: Run all calendar tests to verify they pass**

Run: `npm test -- calendar.controller calendar.service`
Expected: PASS.

- [ ] **Step 11: Full verification (typecheck + whole suite)**

Run: `npm run typecheck && npm test`
Expected: no type errors; all Phase 4 specs pass.

- [ ] **Step 12: Commit**

```bash
git add src/calendar src/app.module.ts
git commit -m "feat: add GET /calendar merging occasions and scheduled posts"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| `SaudiOccasion` model + new migration (§3, LR-004) | Task 1 |
| Error table: VALIDATION_FAILED, RANGE_TOO_WIDE, INVALID_TRANSITION, CONTENT_LOCKED, NOT_FOUND, PUBLISH_NOT_ALLOWED_HERE (§6) | Task 2 (envelope) + enforced in Tasks 3,5,6,9 |
| `PostStateMachine` pure, `ALLOWED_TRANSITIONS`, isolation + rejection tests (§4.1) | Task 3 |
| Types: SaudiOccasion, CalendarEntry, CalendarPostSummary, PostListItem, PostStatus, PostStatusTransition (§3) | Tasks 3,4 |
| `GET /posts` filtered + paginated (default 20, max 100), ordering scheduledAt asc nulls-last then createdAt desc (§4.3) | Task 5 |
| `PATCH /posts/:id` atomic edit + transition, CONTENT_LOCKED, image upsert/delete, scheduledAt set/clear, NOT_FOUND cross-tenant (§4.4) | Task 6 |
| `OccasionModule`/`OccasionService` range read public + tenant (§4.1) | Task 7 |
| `HijriOccasionSeeder` seed script (not HTTP), idempotent upsert on (tenantId, slug, gregorianYear), six kinds, fixed-Gregorian national/foundation, commercial distinct slugs (§5.3) | Task 8 |
| `CalendarModule` `GET /calendar` merge, 92-day cap RANGE_TOO_WIDE (§4.2) | Task 9 |
| AC-1 calendar merge tenant-scoped sorted | Task 9 (merge + sort + tenant `where`) |
| AC-2 six kinds, Hijri computed, idempotent annual | Task 8 |
| AC-3 transitions via ALLOWED_TRANSITIONS, INVALID_TRANSITION 409, no state change | Task 3 + Task 6 (validate-before-write) |
| AC-4 edit only in draft/pending_review, CONTENT_LOCKED on approved | Task 6 |
| AC-5 edit + transition atomic in one transaction | Task 6 ($transaction) |
| AC-6 scheduledAt → appears in calendar as type='post' | Task 6 (set scheduledAt) + Task 9 (post entries) |
| AC-7 every read/write tenant-scoped; cross-tenant → NOT_FOUND | Tasks 5,6,7,9 (tenantId in where; getDetail/patch NOT_FOUND) |
| AC-8 draft posts from engine appear in GET /posts?status=draft, no engine change | Task 5 (status filter, read-only over existing Post) |
| AC-9 >92 days → RANGE_TOO_WIDE; approved→published → PUBLISH_NOT_ALLOWED_HERE | Task 9 (range cap) + Task 3 (publish rejection) |

No gaps found. All AC-1..AC-9 map to at least one task with a covering test.

**2. Placeholder scan:** No "TBD"/"TODO"/"add validation"/"similar to Task N" present. Every code step contains complete code. The only cross-references ("import paths from Phase 3", "global pipe in foundation main.ts") are explicit integration points with the exact symbol names and a fallback instruction, not placeholders. The Phase-3 auth artifacts (`JwtAuthGuard`, `TenantGuard`, `CurrentTenant`, `TenantContext`) are assumed-existing per the brief, not defined here.

**3. Type consistency:**
- `PostStatus` defined once in `post-state-machine.ts` (Task 3) and imported everywhere (Tasks 4,5,6,9 DTOs/services) — single source.
- `PostStatusTransition` defined in Task 3; consumed by `PatchPostInput`/`PatchPostDto` (Task 6) and asserted via `assertTransition` (same signature both ends).
- `PostPlatform = 'linkedin' | 'x'` defined in `post.types.ts` (Task 4), reused in posts, calendar, occasion DTOs — no `Platform` vs `PostPlatform` drift.
- `SaudiOccasionKind` + `SAUDI_OCCASION_KINDS` defined in `occasion.types.ts` (Task 4), reused by seeder defs (Task 8) and calendar/occasion DTOs (Tasks 7,9).
- `EXCERPT_LENGTH = 120` defined in `post.types.ts` (Task 4); used by `CalendarService.toSummary` (Task 9) — calendar test asserts `excerpt.length === 120`.
- `AppError(code, message)` signature identical across Tasks 3,5,6,7,9; codes exactly the six in `ERROR_STATUS` (Task 2).
- Seeder upsert key `tenantId_slug_gregorianYear` matches the Prisma `@@unique([tenantId, slug, gregorianYear])` from Task 1 (Prisma's generated compound-key name).
- `CalendarEntry`/`CalendarPostSummary` shapes used in Task 9 match the Task 4 definitions (`type`, `date`, `occasion?`, `post?`).

No inconsistencies found.

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-06-29-phase4-calendar-approval.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
