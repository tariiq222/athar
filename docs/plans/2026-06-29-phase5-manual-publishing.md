# Phase 5 — Assisted Manual Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "assisted manual publishing" last-mile for أثر: export an approved Post as paste-ready text + downloadable image + a deep link, schedule reminders that fire through extensible notification channels (in-app + email), and let the user mark a Post published — all tenant-scoped.

**Architecture:** A `PublishingModule` (controller + `ExportFormatter`, `DeepLinkBuilder` services + `ReminderScheduler` BullMQ producer + worker) and a `NotificationModule` (controller + `NotificationDispatcher` over a `NotificationChannel` interface with `InAppChannel` and `EmailChannel`). Two new Prisma models (`Reminder`, `Notification`) are added via a NEW migration on the existing foundation schema. Export reads limits from the foundation `platform-limits` config (single source of truth) and uses `twitter-text` for X weighted counting. Reminders are BullMQ delayed jobs, idempotent on `reminderId`, with per-channel independent delivery so one channel's failure never blocks another.

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, BullMQ + ioredis (Redis 7) from foundation `docker-compose.yml`, `twitter-text`, `nodemailer`, Jest.

## Global Constraints

- Multi-tenant logical: every domain row carries `tenantId`; every route is scoped by `tenantId`. (foundation)
- Code, identifiers, comments, commit messages: **English only**. Arabic appears only in user-facing strings (email RTL template body, in-app notification `title`/`body`).
- Route prefix `api/v1` is already set globally in `src/main.ts` (foundation Task 1) — do NOT set it again.
- `tenantId` comes ONLY from the JWT-derived `TenantContext` (Phase 3) — never from body or query params.
- Auth/tenant seam (Phase 3, assumed to exist): `@CurrentTenant() ctx: TenantContext` where `interface TenantContext { userId: string; tenantId: string }`, behind `@UseGuards(JwtAuthGuard, TenantGuard)`. Import paths: `../tenant/current-tenant.decorator`, `../tenant/tenant-context`, `../auth/jwt-auth.guard`, `../tenant/tenant.guard`.
- Cross-tenant access → `404 not_found` (no existence leak). Use the stable error-code envelope `{ statusCode, error, message }` (Phase 3) — carry the snake_case `error` code in the thrown exception body.
- This phase CONSUMES Phase 4 output: a `Post` with `status='approved'`. `mark-published` is the ONLY owner of the `approved → published` transition (one-way); any other status → `409`.
- Platform limits live in `src/config/platform-limits.ts` (foundation Task 5) — the SINGLE source of limits. NEVER hardcode limit values in this phase. Use `twitter-text` weighted counting for X (not `.length`).
- BullMQ delayed jobs are idempotent on `reminderId`; duplicate delivery is guarded by `status != 'sent'`; one channel's failure must not block others.
- Existing enums/models from foundation: `Platform { linkedin, x }`, `PostStatus { draft, pending_review, approved, published }`; models `Post`, `ImageAsset` (1:1 via `ImageAsset.postId @unique`).
- TDD: failing test first, minimal impl, commit per task. Jest config lives in `package.json` (foundation Task 1).

## File Structure

```
prisma/schema.prisma                                  # MODIFY: add Reminder + Notification models (NEW migration)
src/publishing/publishing.module.ts                   # wires controller + services + queue + worker
src/publishing/publishing.types.ts                    # ExportPayload, ExportLink, Reminder DTOs, MarkPublishedResult
src/publishing/dto/create-reminder.dto.ts             # CreateReminderRequest validation
src/publishing/dto/mark-published.dto.ts              # MarkPublishedRequest validation
src/publishing/errors.ts                              # snake_case HttpException helpers for this phase
src/publishing/export-formatter.service.ts            # formattedText + charCount + limit enforcement (doc 15)
src/publishing/export-formatter.service.spec.ts
src/publishing/deep-link-builder.service.ts           # deepLink per platform
src/publishing/deep-link-builder.service.spec.ts
src/publishing/export.service.ts                       # assembles ExportPayload (reads Post + ImageAsset)
src/publishing/export.service.spec.ts
src/publishing/reminder.service.ts                     # create/list/cancel reminders + enqueue/dequeue jobs
src/publishing/reminder.service.spec.ts
src/publishing/reminder.constants.ts                   # queue name + job name constants
src/publishing/reminder.processor.ts                   # BullMQ worker: matures job -> dispatcher
src/publishing/reminder.processor.spec.ts
src/publishing/mark-published.service.ts               # approved -> published + cancel reminders
src/publishing/mark-published.service.spec.ts
src/publishing/publishing.controller.ts                # the 5 publishing routes
src/publishing/publishing.controller.spec.ts
src/notifications/notifications.module.ts              # dispatcher + channels + controller
src/notifications/notification.types.ts               # NotificationChannel, ReminderNotification, DeliveryResult, channel id
src/notifications/in-app.channel.ts                    # writes Notification row
src/notifications/in-app.channel.spec.ts
src/notifications/email.channel.ts                     # Arabic RTL transactional email
src/notifications/email.channel.spec.ts
src/notifications/notification-dispatcher.service.ts   # fan-out to all requested channels, independent results
src/notifications/notification-dispatcher.service.spec.ts
src/notifications/notifications.service.ts             # list + mark-read (tenant scoped)
src/notifications/notifications.service.spec.ts
src/notifications/notifications.controller.ts          # GET /notifications, PATCH /notifications/:id/read
src/notifications/notifications.controller.spec.ts
src/app.module.ts                                      # MODIFY: register both modules + BullModule root
```

---

### Task 1: Dependencies + BullMQ root registration

**Files:**
- Modify: `package.json` (deps)
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: `@nestjs/bullmq` `BullModule.forRoot` configured from `REDIS_URL`; `twitter-text` and `nodemailer` installed; `PublishingModule` and `NotificationModule` registered (created in later tasks — registration is added now so app boots, but the imports are added in Task 13 and Task 11 respectively to avoid a broken intermediate build; here we only add BullModule root + deps).

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/tariq/code/أثر
npm i @nestjs/bullmq bullmq twitter-text nodemailer
npm i -D @types/nodemailer
```

- [ ] **Step 2: Write failing test for BullModule wiring**

Create `src/publishing/reminder.constants.ts` test target later; here assert the queue constants exist. Create `src/publishing/reminder.constants.spec.ts`:

```ts
import { REMINDER_QUEUE, REMINDER_JOB } from './reminder.constants';

describe('reminder constants', () => {
  it('exposes a stable queue name and job name', () => {
    expect(REMINDER_QUEUE).toBe('reminders');
    expect(REMINDER_JOB).toBe('deliver-reminder');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- reminder.constants`
Expected: FAIL — cannot find `./reminder.constants`.

- [ ] **Step 4: Implement `src/publishing/reminder.constants.ts`**

```ts
// Single source for the reminders queue/job identifiers, shared by the
// scheduler (producer) and the processor (consumer).
export const REMINDER_QUEUE = 'reminders';
export const REMINDER_JOB = 'deliver-reminder';
```

- [ ] **Step 5: Register `BullModule.forRoot` in `src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Run test + typecheck**

Run: `npm test -- reminder.constants && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/publishing/reminder.constants.ts src/publishing/reminder.constants.spec.ts src/app.module.ts
git commit -m "chore: add bullmq, twitter-text, nodemailer and bull root module"
```

---

### Task 2: Prisma models Reminder + Notification (NEW migration)

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: tables `Reminder` and `Notification` and regenerated Prisma client. Field shapes match the spec Data Types section.
- Consumes: existing `Post`, `Tenant` models from foundation; `DATABASE_URL`.

- [ ] **Step 1: Append the two models to `prisma/schema.prisma`**

Add at the end of the file (do NOT edit existing models/migrations — LR-004):

```prisma
// Phase 5 — assisted manual publishing. Added by a NEW migration.

model Reminder {
  id        String   @id @default(cuid())
  tenantId  String
  postId    String
  channel   String   // NotificationChannelId: 'in_app' | 'email'
  remindAt  DateTime
  status    String   @default("scheduled") // 'scheduled' | 'sent' | 'failed' | 'cancelled'
  jobId     String?  // BullMQ job id for dequeue on cancel
  createdAt DateTime @default(now())

  @@index([tenantId])
  @@index([postId])
}

model Notification {
  id        String    @id @default(cuid())
  tenantId  String
  userId    String?
  type      String    // NotificationType: 'reminder'
  title     String
  body      String
  postId    String?
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([tenantId])
}
```

- [ ] **Step 2: Create the new migration and regenerate the client**

Run: `npx prisma migrate dev --name add_reminder_and_notification`
Expected: a new migration directory `prisma/migrations/<ts>_add_reminder_and_notification/` is created and applied; client regenerated; no errors.

- [ ] **Step 3: Verify the client exposes both models**

Run: `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log(typeof p.reminder.create, typeof p.notification.create)"`
Expected: `function function`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Reminder and Notification prisma models via new migration"
```

---

### Task 3: Shared types + error helpers

**Files:**
- Create: `src/publishing/publishing.types.ts`
- Create: `src/publishing/errors.ts`
- Create: `src/notifications/notification.types.ts`
- Test: `src/publishing/errors.spec.ts`

**Interfaces:**
- Produces:
  - `type NotificationChannelId = 'in_app' | 'email'`
  - `type ReminderStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled'`
  - `interface ExportLink { url: string; placement: 'in_body' | 'first_reply' }`
  - `interface ExportPayload { postId: string; platform: Platform; formattedText: string; imageUrl?: string; deepLink: string; link?: ExportLink; charCount: number; limitMax: number; notes: string[] }`
  - `interface MarkPublishedResult { postId: string; status: 'published'; publishedAt: string }`
  - `interface ReminderDto { id: string; tenantId: string; postId: string; channel: NotificationChannelId; remindAt: string; status: ReminderStatus; createdAt: string }`
  - `interface NotificationChannel { id: NotificationChannelId; send(payload: ReminderNotification): Promise<DeliveryResult> }`
  - `interface ReminderNotification { tenantId: string; postId: string; export: ExportPayload; remindAt: string }`
  - `interface DeliveryResult { delivered: boolean; error?: string }`
  - `notApproved()`, `exceedsPlatformLimit()`, `invalidStatusTransition()`, `remindAtRequired()`, `remindAtInPast()`, `notFound()`, `reminderAlreadySent()` — each returns a NestJS `HttpException` carrying `{ statusCode, error, message }`.

- [ ] **Step 1: Write failing test for error helpers**

`src/publishing/errors.spec.ts`:

```ts
import {
  notApproved,
  exceedsPlatformLimit,
  invalidStatusTransition,
  remindAtRequired,
  remindAtInPast,
  notFound,
  reminderAlreadySent,
} from './errors';

describe('publishing error helpers', () => {
  it('maps each helper to the spec status + stable code', () => {
    expect(notApproved().getStatus()).toBe(409);
    expect(notApproved().getResponse()).toMatchObject({ error: 'not_approved' });

    expect(exceedsPlatformLimit(300, 280).getStatus()).toBe(422);
    expect(exceedsPlatformLimit(300, 280).getResponse()).toMatchObject({
      error: 'exceeds_platform_limit',
    });

    expect(invalidStatusTransition('draft').getStatus()).toBe(409);
    expect(invalidStatusTransition('draft').getResponse()).toMatchObject({
      error: 'invalid_status_transition',
    });

    expect(remindAtRequired().getStatus()).toBe(422);
    expect(remindAtRequired().getResponse()).toMatchObject({ error: 'remind_at_required' });

    expect(remindAtInPast().getStatus()).toBe(422);
    expect(remindAtInPast().getResponse()).toMatchObject({ error: 'remind_at_in_past' });

    expect(notFound().getStatus()).toBe(404);
    expect(notFound().getResponse()).toMatchObject({ error: 'not_found' });

    expect(reminderAlreadySent().getStatus()).toBe(409);
    expect(reminderAlreadySent().getResponse()).toMatchObject({ error: 'reminder_already_sent' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publishing/errors`
Expected: FAIL — cannot find `./errors`.

- [ ] **Step 3: Implement `src/publishing/errors.ts`**

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

// All phase-5 domain errors use the project envelope { statusCode, error, message }
// where `error` is a stable snake_case code consumed by the frontend.
function make(status: HttpStatus, error: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error, message }, status);
}

export function notApproved(): HttpException {
  return make(HttpStatus.CONFLICT, 'not_approved', 'Post must be approved before export.');
}

export function exceedsPlatformLimit(charCount: number, limitMax: number): HttpException {
  return make(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'exceeds_platform_limit',
    `Formatted text (${charCount}) exceeds the platform limit (${limitMax}); send back to review.`,
  );
}

export function invalidStatusTransition(currentStatus: string): HttpException {
  return make(
    HttpStatus.CONFLICT,
    'invalid_status_transition',
    `Only approved posts can be published; current status is ${currentStatus}.`,
  );
}

export function remindAtRequired(): HttpException {
  return make(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'remind_at_required',
    'remindAt is required when the post has no scheduledAt.',
  );
}

export function remindAtInPast(): HttpException {
  return make(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'remind_at_in_past',
    'remindAt must be in the future.',
  );
}

export function notFound(): HttpException {
  return make(HttpStatus.NOT_FOUND, 'not_found', 'Resource not found.');
}

export function reminderAlreadySent(): HttpException {
  return make(
    HttpStatus.CONFLICT,
    'reminder_already_sent',
    'A sent reminder cannot be cancelled.',
  );
}
```

- [ ] **Step 4: Implement `src/publishing/publishing.types.ts`**

```ts
import type { Platform } from '../config/platform-limits';

export type NotificationChannelId = 'in_app' | 'email';
export type ReminderStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled';

export interface ExportLink {
  url: string;
  placement: 'in_body' | 'first_reply';
}

export interface ExportPayload {
  postId: string;
  platform: Platform;
  formattedText: string; // paste-ready: body + hashtags in platform order
  imageUrl?: string; // ImageAsset.url when present (separate download button)
  deepLink: string; // opens composer / platform
  link?: ExportLink; // external link and where it goes
  charCount: number; // weighted count (twitter-text for X)
  limitMax: number; // max chars from platform-limits
  notes: string[]; // manual guidance for the user
}

export interface MarkPublishedResult {
  postId: string;
  status: 'published';
  publishedAt: string; // ISO
}

export interface ReminderDto {
  id: string;
  tenantId: string;
  postId: string;
  channel: NotificationChannelId;
  remindAt: string; // ISO
  status: ReminderStatus;
  createdAt: string; // ISO
}
```

- [ ] **Step 5: Implement `src/notifications/notification.types.ts`**

```ts
import type { ExportPayload, NotificationChannelId } from '../publishing/publishing.types';

export type { NotificationChannelId };

export interface ReminderNotification {
  tenantId: string;
  postId: string;
  export: ExportPayload; // the post, ready, inside the reminder
  remindAt: string; // ISO
}

export interface DeliveryResult {
  delivered: boolean;
  error?: string;
}

export interface NotificationChannel {
  id: NotificationChannelId;
  send(payload: ReminderNotification): Promise<DeliveryResult>;
}

// DI token for the array of registered channels. Adding WhatsappChannel later
// means registering one more provider in this token — no scheduler/route changes.
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- publishing/errors && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/publishing/publishing.types.ts src/publishing/errors.ts src/publishing/errors.spec.ts src/notifications/notification.types.ts
git commit -m "feat: add phase-5 shared types and error helpers"
```

---

### Task 4: ExportFormatter service (platform limits + twitter-text)

**Files:**
- Create: `src/publishing/export-formatter.service.ts`
- Test: `src/publishing/export-formatter.service.spec.ts`

**Interfaces:**
- Consumes: `getLimit(platform)` from `../config/platform-limits`; `twitter-text`; types from `./publishing.types`; `exceedsPlatformLimit` from `./errors`.
- Produces: `class ExportFormatter` with
  `format(input: FormatInput): FormatResult`
  where
  `interface FormatInput { platform: Platform; text: string; hashtags: string[]; link?: string }`
  and
  `interface FormatResult { formattedText: string; charCount: number; limitMax: number; link?: ExportLink; notes: string[] }`.
  - LinkedIn: hashtags joined at the end, link `in_body`, note to remove the preview card; `charCount` = `formattedText.length`; `limitMax` = `getLimit('linkedin').maxChars` (3000).
  - X: link kept OUT of `formattedText` (`first_reply`); `charCount` = `twitter.parseTweet(formattedText).weightedLength`; `limitMax` = `getLimit('x').maxChars` (280).
  - Either platform: `charCount > limitMax` → throw `exceedsPlatformLimit(charCount, limitMax)`.

- [ ] **Step 1: Write failing tests**

`src/publishing/export-formatter.service.spec.ts`:

```ts
import { ExportFormatter } from './export-formatter.service';

describe('ExportFormatter', () => {
  const fmt = new ExportFormatter();

  it('LinkedIn: appends hashtags, puts link in body, notes preview-card removal, limit 3000', () => {
    const r = fmt.format({
      platform: 'linkedin',
      text: 'Hello world',
      hashtags: ['#a', '#b', '#c'],
      link: 'https://example.com',
    });
    expect(r.limitMax).toBe(3000);
    expect(r.formattedText).toContain('Hello world');
    expect(r.formattedText).toContain('#a #b #c');
    expect(r.formattedText).toContain('https://example.com'); // link in body
    expect(r.link).toEqual({ url: 'https://example.com', placement: 'in_body' });
    expect(r.notes.join(' ')).toMatch(/preview card|بطاقة المعاينة/);
    expect(r.charCount).toBe(r.formattedText.length);
  });

  it('X: keeps link OUT of body (first_reply) and counts weighted length, limit 280', () => {
    const r = fmt.format({
      platform: 'x',
      text: 'Short post',
      hashtags: ['#a'],
      link: 'https://example.com',
    });
    expect(r.limitMax).toBe(280);
    expect(r.formattedText).toContain('Short post');
    expect(r.formattedText).toContain('#a');
    expect(r.formattedText).not.toContain('https://example.com'); // link goes to a reply
    expect(r.link).toEqual({ url: 'https://example.com', placement: 'first_reply' });
    expect(r.charCount).toBeLessThanOrEqual(280);
  });

  it('X: weighted count treats Arabic as weight 1 (full ~280 budget)', () => {
    const arabic = 'ا'.repeat(279);
    const r = fmt.format({ platform: 'x', text: arabic, hashtags: [] });
    expect(r.charCount).toBe(279); // weight 1 per Arabic char (not CJK)
  });

  it('throws exceeds_platform_limit when X body is over 280 weighted', () => {
    const tooLong = 'a'.repeat(281);
    expect(() => fmt.format({ platform: 'x', text: tooLong, hashtags: [] })).toThrow(
      /exceeds the platform limit/,
    );
  });

  it('throws exceeds_platform_limit when LinkedIn body is over 3000', () => {
    const tooLong = 'a'.repeat(3001);
    expect(() => fmt.format({ platform: 'linkedin', text: tooLong, hashtags: [] })).toThrow(
      /exceeds the platform limit/,
    );
  });

  it('formats with no link and no hashtags cleanly', () => {
    const r = fmt.format({ platform: 'linkedin', text: 'Just text', hashtags: [] });
    expect(r.formattedText).toBe('Just text');
    expect(r.link).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- export-formatter`
Expected: FAIL — cannot find `./export-formatter.service`.

- [ ] **Step 3: Implement `src/publishing/export-formatter.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import * as twitter from 'twitter-text';
import { getLimit, type Platform } from '../config/platform-limits';
import type { ExportLink } from './publishing.types';
import { exceedsPlatformLimit } from './errors';

export interface FormatInput {
  platform: Platform;
  text: string;
  hashtags: string[];
  link?: string;
}

export interface FormatResult {
  formattedText: string;
  charCount: number;
  limitMax: number;
  link?: ExportLink;
  notes: string[];
}

@Injectable()
export class ExportFormatter {
  format(input: FormatInput): FormatResult {
    const limit = getLimit(input.platform);
    const limitMax = limit.maxChars;
    const notes: string[] = [];
    const parts: string[] = [input.text.trim()];

    if (input.platform === 'linkedin') {
      // LinkedIn: link in body, remove the preview card; hashtags at the end.
      let link: ExportLink | undefined;
      if (input.hashtags.length > 0) parts.push(input.hashtags.join(' '));
      if (input.link) {
        parts.push(input.link);
        link = { url: input.link, placement: 'in_body' };
        notes.push('احذف بطاقة المعاينة (preview card) — تخفض الوصول.');
      }
      const formattedText = parts.filter(Boolean).join('\n\n');
      const charCount = formattedText.length;
      if (charCount > limitMax) throw exceedsPlatformLimit(charCount, limitMax);
      return { formattedText, charCount, limitMax, link, notes };
    }

    // X: link in a separate reply (kept OUT of formattedText); weighted count.
    let link: ExportLink | undefined;
    if (input.hashtags.length > 0) parts.push(input.hashtags.join(' '));
    if (input.link) {
      link = { url: input.link, placement: 'first_reply' };
      notes.push('ضع الرابط في أول ردّ (reply) لا في المتن — الروابط تخفض الوصول.');
    }
    const formattedText = parts.filter(Boolean).join('\n\n');
    const charCount = twitter.parseTweet(formattedText).weightedLength;
    if (charCount > limitMax) throw exceedsPlatformLimit(charCount, limitMax);
    return { formattedText, charCount, limitMax, link, notes };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- export-formatter`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/publishing/export-formatter.service.ts src/publishing/export-formatter.service.spec.ts
git commit -m "feat: add ExportFormatter applying platform limits and twitter-text"
```

---

### Task 5: DeepLinkBuilder service

**Files:**
- Create: `src/publishing/deep-link-builder.service.ts`
- Test: `src/publishing/deep-link-builder.service.spec.ts`

**Interfaces:**
- Produces: `class DeepLinkBuilder` with `build(platform: Platform, formattedText: string): string`.
  - LinkedIn → `https://www.linkedin.com/feed/?shareActive=true` (opens composer; no reliable prefill).
  - X → `https://x.com/intent/post?text=<urlencoded>` when `formattedText` fits the intent budget (<= 280 weighted), else `https://x.com/intent/post` (empty composer).
- Consumes: `twitter-text` (reuse weighted length to decide injection); `getLimit` from `../config/platform-limits`.

- [ ] **Step 1: Write failing tests**

`src/publishing/deep-link-builder.service.spec.ts`:

```ts
import { DeepLinkBuilder } from './deep-link-builder.service';

describe('DeepLinkBuilder', () => {
  const b = new DeepLinkBuilder();

  it('LinkedIn returns the share-active composer URL', () => {
    expect(b.build('linkedin', 'anything')).toBe(
      'https://www.linkedin.com/feed/?shareActive=true',
    );
  });

  it('X injects short text into the intent (url-encoded)', () => {
    const url = b.build('x', 'Hello world');
    expect(url).toBe('https://x.com/intent/post?text=Hello%20world');
  });

  it('X opens an empty composer when text exceeds the 280 weighted budget', () => {
    const url = b.build('x', 'a'.repeat(281));
    expect(url).toBe('https://x.com/intent/post');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deep-link-builder`
Expected: FAIL — cannot find `./deep-link-builder.service`.

- [ ] **Step 3: Implement `src/publishing/deep-link-builder.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import * as twitter from 'twitter-text';
import { getLimit, type Platform } from '../config/platform-limits';

@Injectable()
export class DeepLinkBuilder {
  build(platform: Platform, formattedText: string): string {
    if (platform === 'linkedin') {
      // No reliable URL prefill for a normal post: open the composer; user pastes.
      return 'https://www.linkedin.com/feed/?shareActive=true';
    }
    // X web intent supports prefilled text within URL/length budget.
    const fits = twitter.parseTweet(formattedText).weightedLength <= getLimit('x').maxChars;
    if (fits) {
      return `https://x.com/intent/post?text=${encodeURIComponent(formattedText)}`;
    }
    return 'https://x.com/intent/post';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deep-link-builder`
Expected: PASS. (Note: `encodeURIComponent('Hello world')` → `Hello%20world`.)

- [ ] **Step 5: Commit**

```bash
git add src/publishing/deep-link-builder.service.ts src/publishing/deep-link-builder.service.spec.ts
git commit -m "feat: add DeepLinkBuilder for linkedin and x composer links"
```

---

### Task 6: ExportService (assembles ExportPayload, tenant-scoped)

**Files:**
- Create: `src/publishing/export.service.ts`
- Test: `src/publishing/export.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `ExportFormatter.format`; `DeepLinkBuilder.build`; errors `notApproved`, `notFound`.
- Produces: `class ExportService` with
  `buildPayload(tenantId: string, postId: string, platform?: Platform): Promise<ExportPayload>`.
  - Loads `Post` (with `image`) where `{ id: postId, tenantId }`; missing/cross-tenant → `notFound()`.
  - `status !== 'approved'` → `notApproved()`.
  - `platform` defaults to `post.platform`.
  - `link` source = first `SourceCitation.sourceUrl` if present (else none) — accessed via `post.citations`. (Spec: external link if present; reuse the post's citation URL as the canonical external link.)
  - Sets `imageUrl` only when `post.image` exists (image is separate from text).

- [ ] **Step 1: Write failing tests**

`src/publishing/export.service.spec.ts`:

```ts
import { ExportService } from './export.service';
import { ExportFormatter } from './export-formatter.service';
import { DeepLinkBuilder } from './deep-link-builder.service';

function makePrisma(post: any) {
  return { post: { findFirst: jest.fn().mockResolvedValue(post) } } as any;
}

describe('ExportService', () => {
  const formatter = new ExportFormatter();
  const linker = new DeepLinkBuilder();

  it('builds a payload for an approved post with image and citation link', async () => {
    const prisma = makePrisma({
      id: 'p1',
      tenantId: 't1',
      platform: 'linkedin',
      status: 'approved',
      text: 'Body',
      hashtags: ['#x', '#y', '#z'],
      image: { url: 'https://img/p1.png' },
      citations: [{ sourceUrl: 'https://src.example' }],
    });
    const svc = new ExportService(prisma, formatter, linker);
    const payload = await svc.buildPayload('t1', 'p1');
    expect(payload.postId).toBe('p1');
    expect(payload.platform).toBe('linkedin');
    expect(payload.imageUrl).toBe('https://img/p1.png');
    expect(payload.formattedText).toContain('Body');
    expect(payload.link).toEqual({ url: 'https://src.example', placement: 'in_body' });
    expect(payload.limitMax).toBe(3000);
    expect(payload.deepLink).toBe('https://www.linkedin.com/feed/?shareActive=true');
  });

  it('omits imageUrl when the post has no image (200, text-only)', async () => {
    const prisma = makePrisma({
      id: 'p2',
      tenantId: 't1',
      platform: 'x',
      status: 'approved',
      text: 'Tweet',
      hashtags: ['#a'],
      image: null,
      citations: [],
    });
    const svc = new ExportService(prisma, formatter, linker);
    const payload = await svc.buildPayload('t1', 'p2');
    expect(payload.imageUrl).toBeUndefined();
    expect(payload.link).toBeUndefined();
  });

  it('allows an explicit platform override', async () => {
    const prisma = makePrisma({
      id: 'p3',
      tenantId: 't1',
      platform: 'linkedin',
      status: 'approved',
      text: 'Body',
      hashtags: ['#a'],
      image: null,
      citations: [],
    });
    const svc = new ExportService(prisma, formatter, linker);
    const payload = await svc.buildPayload('t1', 'p3', 'x');
    expect(payload.platform).toBe('x');
    expect(payload.limitMax).toBe(280);
  });

  it('throws not_found for a missing or cross-tenant post', async () => {
    const prisma = makePrisma(null);
    const svc = new ExportService(prisma, formatter, linker);
    await expect(svc.buildPayload('t1', 'nope')).rejects.toMatchObject({
      response: { error: 'not_found' },
    });
  });

  it('throws not_approved for a non-approved post', async () => {
    const prisma = makePrisma({
      id: 'p4',
      tenantId: 't1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    });
    const svc = new ExportService(prisma, formatter, linker);
    await expect(svc.buildPayload('t1', 'p4')).rejects.toMatchObject({
      response: { error: 'not_approved' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publishing/export.service`
Expected: FAIL — cannot find `./export.service`.

- [ ] **Step 3: Implement `src/publishing/export.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Platform } from '../config/platform-limits';
import { ExportFormatter } from './export-formatter.service';
import { DeepLinkBuilder } from './deep-link-builder.service';
import type { ExportPayload } from './publishing.types';
import { notApproved, notFound } from './errors';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formatter: ExportFormatter,
    private readonly linker: DeepLinkBuilder,
  ) {}

  async buildPayload(
    tenantId: string,
    postId: string,
    platform?: Platform,
  ): Promise<ExportPayload> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, tenantId },
      include: { image: true, citations: true },
    });
    if (!post) throw notFound();
    if (post.status !== 'approved') throw notApproved();

    const target: Platform = platform ?? (post.platform as Platform);
    const link = post.citations[0]?.sourceUrl as string | undefined;

    const formatted = this.formatter.format({
      platform: target,
      text: post.text,
      hashtags: post.hashtags,
      link,
    });
    const deepLink = this.linker.build(target, formatted.formattedText);

    const payload: ExportPayload = {
      postId: post.id,
      platform: target,
      formattedText: formatted.formattedText,
      deepLink,
      charCount: formatted.charCount,
      limitMax: formatted.limitMax,
      notes: formatted.notes,
    };
    if (post.image?.url) payload.imageUrl = post.image.url;
    if (formatted.link) payload.link = formatted.link;
    return payload;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- publishing/export.service`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/publishing/export.service.ts src/publishing/export.service.spec.ts
git commit -m "feat: add ExportService assembling tenant-scoped ExportPayload"
```

---

### Task 7: InAppChannel (writes Notification row)

**Files:**
- Create: `src/notifications/in-app.channel.ts`
- Test: `src/notifications/in-app.channel.spec.ts`

**Interfaces:**
- Implements `NotificationChannel` with `id = 'in_app'`.
- Consumes: `PrismaService`; `ReminderNotification`, `DeliveryResult`.
- Produces: on `send`, inserts a `Notification` row `{ tenantId, type: 'reminder', title, body, postId }` (Arabic title/body summarizing the post + a cue to open the editor/export); returns `{ delivered: true }`. On DB error returns `{ delivered: false, error }`.

- [ ] **Step 1: Write failing tests**

`src/notifications/in-app.channel.spec.ts`:

```ts
import { InAppChannel } from './in-app.channel';
import type { ReminderNotification } from './notification.types';

const reminder: ReminderNotification = {
  tenantId: 't1',
  postId: 'p1',
  remindAt: '2026-07-01T09:00:00.000Z',
  export: {
    postId: 'p1',
    platform: 'x',
    formattedText: 'Ready to post',
    deepLink: 'https://x.com/intent/post',
    charCount: 13,
    limitMax: 280,
    notes: [],
  },
};

describe('InAppChannel', () => {
  it('has id in_app', () => {
    expect(new InAppChannel({} as any).id).toBe('in_app');
  });

  it('writes a reminder Notification row scoped to the tenant', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'n1' });
    const ch = new InAppChannel({ notification: { create } } as any);
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: true });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        type: 'reminder',
        postId: 'p1',
      }),
    });
    const data = create.mock.calls[0][0].data;
    expect(typeof data.title).toBe('string');
    expect(data.title.length).toBeGreaterThan(0);
    expect(typeof data.body).toBe('string');
  });

  it('returns delivered=false with error on db failure', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const ch = new InAppChannel({ notification: { create } } as any);
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: false, error: 'db down' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- in-app.channel`
Expected: FAIL — cannot find `./in-app.channel`.

- [ ] **Step 3: Implement `src/notifications/in-app.channel.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  NotificationChannel,
  NotificationChannelId,
  ReminderNotification,
  DeliveryResult,
} from './notification.types';

@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly id: NotificationChannelId = 'in_app';

  constructor(private readonly prisma: PrismaService) {}

  async send(payload: ReminderNotification): Promise<DeliveryResult> {
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: payload.tenantId,
          type: 'reminder',
          title: 'تذكير نشر: بوستك جاهز للنشر',
          body: `حان موعد نشر بوستك. النص جاهز قدّامك للنسخ، والصورة جاهزة للتنزيل — افتح المحرّر للتصدير والنشر.`,
          postId: payload.postId,
        },
      });
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- in-app.channel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/in-app.channel.ts src/notifications/in-app.channel.spec.ts
git commit -m "feat: add InAppChannel writing reminder Notification rows"
```

---

### Task 8: EmailChannel (Arabic RTL transactional email)

**Files:**
- Create: `src/notifications/email.channel.ts`
- Test: `src/notifications/email.channel.spec.ts`

**Interfaces:**
- Implements `NotificationChannel` with `id = 'email'`.
- Consumes: a `Transporter`-like object (`{ sendMail(options): Promise<unknown> }`) injected via the `MAIL_TRANSPORTER` token; resolves the recipient via `PrismaService` (first user of the tenant).
- Produces: on `send`, builds an Arabic RTL HTML email (`<html dir="rtl" lang="ar">`) containing the ready text, the image URL (if any), and an "open platform" button (`export.deepLink`), then calls `sendMail`; returns `{ delivered: true }` or `{ delivered: false, error }`.

- [ ] **Step 1: Write failing tests**

`src/notifications/email.channel.spec.ts`:

```ts
import { EmailChannel } from './email.channel';
import type { ReminderNotification } from './notification.types';

const reminder: ReminderNotification = {
  tenantId: 't1',
  postId: 'p1',
  remindAt: '2026-07-01T09:00:00.000Z',
  export: {
    postId: 'p1',
    platform: 'linkedin',
    formattedText: 'Ready to post body',
    imageUrl: 'https://img/p1.png',
    deepLink: 'https://www.linkedin.com/feed/?shareActive=true',
    charCount: 18,
    limitMax: 3000,
    notes: [],
  },
};

function prismaWithUser(email: string | null) {
  return {
    user: { findFirst: jest.fn().mockResolvedValue(email ? { email } : null) },
  } as any;
}

describe('EmailChannel', () => {
  it('has id email', () => {
    expect(new EmailChannel({ sendMail: jest.fn() } as any, prismaWithUser('a@b.c')).id).toBe(
      'email',
    );
  });

  it('sends an RTL Arabic email with the ready text, image and deep link', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const ch = new EmailChannel({ sendMail } as any, prismaWithUser('a@b.c'));
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: true });
    const opts = sendMail.mock.calls[0][0];
    expect(opts.to).toBe('a@b.c');
    expect(opts.html).toContain('dir="rtl"');
    expect(opts.html).toContain('Ready to post body');
    expect(opts.html).toContain('https://img/p1.png');
    expect(opts.html).toContain('https://www.linkedin.com/feed/?shareActive=true');
  });

  it('returns delivered=false when there is no recipient', async () => {
    const sendMail = jest.fn();
    const ch = new EmailChannel({ sendMail } as any, prismaWithUser(null));
    const res = await ch.send(reminder);
    expect(res.delivered).toBe(false);
    expect(res.error).toMatch(/recipient/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('returns delivered=false with error on transport failure', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('smtp down'));
    const ch = new EmailChannel({ sendMail } as any, prismaWithUser('a@b.c'));
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: false, error: 'smtp down' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- email.channel`
Expected: FAIL — cannot find `./email.channel`.

- [ ] **Step 3: Implement `src/notifications/email.channel.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  NotificationChannel,
  NotificationChannelId,
  ReminderNotification,
  DeliveryResult,
} from './notification.types';

// Minimal transporter contract so we don't couple to nodemailer's concrete type in tests.
export interface MailTransporter {
  sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
}

export const MAIL_TRANSPORTER = Symbol('MAIL_TRANSPORTER');

@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly id: NotificationChannelId = 'email';

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly mailer: MailTransporter,
    private readonly prisma: PrismaService,
  ) {}

  async send(payload: ReminderNotification): Promise<DeliveryResult> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { tenantId: payload.tenantId },
      });
      if (!user?.email) {
        return { delivered: false, error: 'no recipient for tenant' };
      }
      await this.mailer.sendMail({
        to: user.email,
        subject: 'تذكير: بوستك جاهز للنشر',
        html: this.render(payload),
      });
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }

  private render(payload: ReminderNotification): string {
    const e = payload.export;
    const image = e.imageUrl
      ? `<p><a href="${e.imageUrl}">تنزيل الصورة</a></p>`
      : '';
    const escaped = e.formattedText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="font-family: Tahoma, Arial, sans-serif; text-align: right;">
    <h2>تذكير نشر</h2>
    <p>حان موعد نشر بوستك. النص جاهز للنسخ:</p>
    <pre style="white-space: pre-wrap; background:#f4f4f4; padding:12px;">${escaped}</pre>
    ${image}
    <p><a href="${e.deepLink}" style="display:inline-block;padding:10px 16px;background:#0a66c2;color:#fff;text-decoration:none;border-radius:6px;">افتح المنصة وانشر</a></p>
  </body>
</html>`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- email.channel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/email.channel.ts src/notifications/email.channel.spec.ts
git commit -m "feat: add EmailChannel with arabic rtl transactional template"
```

---

### Task 9: NotificationDispatcher (independent per-channel fan-out)

**Files:**
- Create: `src/notifications/notification-dispatcher.service.ts`
- Test: `src/notifications/notification-dispatcher.service.spec.ts`

**Interfaces:**
- Consumes: the registered channels array via the `NOTIFICATION_CHANNELS` token; `ReminderNotification`, `DeliveryResult`.
- Produces: `class NotificationDispatcher` with
  `dispatch(channelId: NotificationChannelId, payload: ReminderNotification): Promise<DeliveryResult>`.
  Resolves the channel by `id`; unknown id → `{ delivered: false, error: 'unknown channel: <id>' }`. A channel that throws is caught → `{ delivered: false, error }` (one channel's failure never propagates).

- [ ] **Step 1: Write failing tests**

`src/notifications/notification-dispatcher.service.spec.ts`:

```ts
import { NotificationDispatcher } from './notification-dispatcher.service';
import type {
  NotificationChannel,
  ReminderNotification,
} from './notification.types';

const reminder: ReminderNotification = {
  tenantId: 't1',
  postId: 'p1',
  remindAt: '2026-07-01T09:00:00.000Z',
  export: {
    postId: 'p1',
    platform: 'x',
    formattedText: 'Ready',
    deepLink: 'https://x.com/intent/post',
    charCount: 5,
    limitMax: 280,
    notes: [],
  },
};

function channel(id: any, impl: () => Promise<any>): NotificationChannel {
  return { id, send: impl } as NotificationChannel;
}

describe('NotificationDispatcher', () => {
  it('dispatches to the channel matching the id', async () => {
    const inApp = channel('in_app', async () => ({ delivered: true }));
    const email = channel('email', async () => ({ delivered: false, error: 'x' }));
    const d = new NotificationDispatcher([inApp, email]);
    await expect(d.dispatch('in_app', reminder)).resolves.toEqual({ delivered: true });
  });

  it('returns delivered=false for an unknown channel id', async () => {
    const d = new NotificationDispatcher([]);
    await expect(d.dispatch('whatsapp' as any, reminder)).resolves.toEqual({
      delivered: false,
      error: 'unknown channel: whatsapp',
    });
  });

  it('catches a throwing channel so it cannot propagate', async () => {
    const boom = channel('email', async () => {
      throw new Error('kaboom');
    });
    const d = new NotificationDispatcher([boom]);
    await expect(d.dispatch('email', reminder)).resolves.toEqual({
      delivered: false,
      error: 'kaboom',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- notification-dispatcher`
Expected: FAIL — cannot find `./notification-dispatcher.service`.

- [ ] **Step 3: Implement `src/notifications/notification-dispatcher.service.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationChannelId,
  type ReminderNotification,
  type DeliveryResult,
} from './notification.types';

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
  ) {}

  async dispatch(
    channelId: NotificationChannelId,
    payload: ReminderNotification,
  ): Promise<DeliveryResult> {
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel) {
      return { delivered: false, error: `unknown channel: ${channelId}` };
    }
    try {
      return await channel.send(payload);
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- notification-dispatcher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/notification-dispatcher.service.ts src/notifications/notification-dispatcher.service.spec.ts
git commit -m "feat: add NotificationDispatcher with isolated per-channel delivery"
```

---

### Task 10: NotificationsService + NotificationsController (list + read)

**Files:**
- Create: `src/notifications/notifications.service.ts`
- Create: `src/notifications/notifications.controller.ts`
- Test: `src/notifications/notifications.service.spec.ts`
- Test: `src/notifications/notifications.controller.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `@CurrentTenant() ctx: TenantContext`; guards `JwtAuthGuard`, `TenantGuard`; `notFound`.
- Produces:
  - `class NotificationsService`:
    - `list(ctx: TenantContext, unreadOnly?: boolean): Promise<Notification[]>` — `where: { tenantId, OR: [{ userId: ctx.userId }, { userId: null }] }`, `readAt: null` when `unreadOnly`, ordered `createdAt desc`.
    - `markRead(ctx: TenantContext, id: string): Promise<Notification>` — updates `readAt` only when currently null (idempotent); cross-tenant/missing → `notFound()`.
  - `class NotificationsController`: `GET /notifications?unreadOnly=` and `PATCH /notifications/:id/read`.

- [ ] **Step 1: Write failing service tests**

`src/notifications/notifications.service.spec.ts`:

```ts
import { NotificationsService } from './notifications.service';

const ctx = { userId: 'u1', tenantId: 't1' };

describe('NotificationsService', () => {
  it('lists tenant + user-scoped notifications newest first', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'n1' }]);
    const svc = new NotificationsService({ notification: { findMany } } as any);
    const res = await svc.list(ctx as any);
    expect(res).toEqual([{ id: 'n1' }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', OR: [{ userId: 'u1' }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters unread only when requested', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new NotificationsService({ notification: { findMany } } as any);
    await svc.list(ctx as any, true);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', OR: [{ userId: 'u1' }, { userId: null }], readAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('marks an unread notification read (sets readAt)', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'n1', readAt: null });
    const update = jest.fn().mockResolvedValue({ id: 'n1', readAt: new Date() });
    const svc = new NotificationsService({
      notification: { findFirst, update },
    } as any);
    const res = await svc.markRead(ctx as any, 'n1');
    expect(res.readAt).not.toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('is idempotent: already-read notification keeps its readAt and returns 200', async () => {
    const prior = new Date('2026-06-01T00:00:00.000Z');
    const findFirst = jest.fn().mockResolvedValue({ id: 'n1', readAt: prior });
    const update = jest.fn();
    const svc = new NotificationsService({
      notification: { findFirst, update },
    } as any);
    const res = await svc.markRead(ctx as any, 'n1');
    expect(res.readAt).toEqual(prior);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws not_found for a cross-tenant notification', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const svc = new NotificationsService({ notification: { findFirst } } as any);
    await expect(svc.markRead(ctx as any, 'x')).rejects.toMatchObject({
      response: { error: 'not_found' },
    });
  });
});
```

- [ ] **Step 2: Run service test to verify it fails**

Run: `npm test -- notifications.service`
Expected: FAIL — cannot find `./notifications.service`.

- [ ] **Step 3: Implement `src/notifications/notifications.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant-context';
import { notFound } from '../publishing/errors';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext, unreadOnly?: boolean) {
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      OR: [{ userId: ctx.userId }, { userId: null }],
    };
    if (unreadOnly) where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(ctx: TenantContext, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw notFound();
    if (existing.readAt) return existing; // idempotent
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Run service test to verify it passes**

Run: `npm test -- notifications.service`
Expected: PASS.

- [ ] **Step 5: Write failing controller test**

`src/notifications/notifications.controller.spec.ts`:

```ts
import { NotificationsController } from './notifications.controller';

const ctx = { userId: 'u1', tenantId: 't1' };

describe('NotificationsController', () => {
  it('GET /notifications passes unreadOnly through to the service', async () => {
    const list = jest.fn().mockResolvedValue([{ id: 'n1' }]);
    const ctrl = new NotificationsController({ list } as any);
    const res = await ctrl.list(ctx as any, 'true');
    expect(res).toEqual([{ id: 'n1' }]);
    expect(list).toHaveBeenCalledWith(ctx, true);
  });

  it('GET /notifications treats a missing query as unreadOnly=false', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const ctrl = new NotificationsController({ list } as any);
    await ctrl.list(ctx as any, undefined);
    expect(list).toHaveBeenCalledWith(ctx, false);
  });

  it('PATCH /notifications/:id/read delegates to the service', async () => {
    const markRead = jest.fn().mockResolvedValue({ id: 'n1', readAt: new Date() });
    const ctrl = new NotificationsController({ markRead } as any);
    const res = await ctrl.markRead(ctx as any, 'n1');
    expect(res.id).toBe('n1');
    expect(markRead).toHaveBeenCalledWith(ctx, 'n1');
  });
});
```

- [ ] **Step 6: Run controller test to verify it fails**

Run: `npm test -- notifications.controller`
Expected: FAIL — cannot find `./notifications.controller`.

- [ ] **Step 7: Implement `src/notifications/notifications.controller.ts`**

```ts
import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import type { TenantContext } from '../tenant/tenant-context';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentTenant() ctx: TenantContext, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.list(ctx, unreadOnly === 'true');
  }

  @Patch(':id/read')
  markRead(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.notifications.markRead(ctx, id);
  }
}
```

- [ ] **Step 8: Run controller test to verify it passes**

Run: `npm test -- notifications.controller`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/notifications/notifications.service.ts src/notifications/notifications.service.spec.ts src/notifications/notifications.controller.ts src/notifications/notifications.controller.spec.ts
git commit -m "feat: add notifications list and mark-read endpoints (tenant scoped)"
```

---

### Task 11: NotificationModule (wire channels + dispatcher + transporter)

**Files:**
- Create: `src/notifications/notifications.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: `NotificationModule` providing `InAppChannel`, `EmailChannel`, the `NOTIFICATION_CHANNELS` array (`[InAppChannel, EmailChannel]`), the `MAIL_TRANSPORTER` (a nodemailer transport built from env), `NotificationDispatcher`, `NotificationsService`; controller `NotificationsController`; exports `NotificationDispatcher` (consumed by the reminder processor). Adding `WhatsappChannel` later = add a provider + push it into the `NOTIFICATION_CHANNELS` factory array (AC-6).

- [ ] **Step 1: Write failing module test**

`src/notifications/notifications.module.ts` is wired via DI; assert the dispatcher resolves with both channels. Create `src/notifications/notifications.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NotificationModule } from './notifications.module';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationModule', () => {
  it('resolves NotificationDispatcher with in_app and email channels', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const dispatcher = moduleRef.get(NotificationDispatcher);
    // unknown channel proves the array is wired (no throw, isolated result)
    await expect(
      dispatcher.dispatch('email', {
        tenantId: 't1',
        postId: 'p1',
        remindAt: '2026-07-01T00:00:00.000Z',
        export: {
          postId: 'p1',
          platform: 'x',
          formattedText: 'x',
          deepLink: 'https://x.com/intent/post',
          charCount: 1,
          limitMax: 280,
          notes: [],
        },
      }),
    ).resolves.toHaveProperty('delivered');
  });
});
```

- [ ] **Step 2: Run module test to verify it fails**

Run: `npm test -- notifications.module`
Expected: FAIL — cannot find `./notifications.module`.

- [ ] **Step 3: Implement `src/notifications/notifications.module.ts`**

```ts
import { Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { InAppChannel } from './in-app.channel';
import { EmailChannel, MAIL_TRANSPORTER, type MailTransporter } from './email.channel';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification.types';

@Module({
  controllers: [NotificationsController],
  providers: [
    InAppChannel,
    EmailChannel,
    NotificationDispatcher,
    NotificationsService,
    {
      provide: MAIL_TRANSPORTER,
      useFactory: (): MailTransporter =>
        nodemailer.createTransport({
          host: process.env.SMTP_HOST ?? 'localhost',
          port: Number(process.env.SMTP_PORT ?? 1025),
          secure: false,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        }) as unknown as MailTransporter,
    },
    {
      // The single registration point for channels. Add WhatsappChannel here later.
      provide: NOTIFICATION_CHANNELS,
      useFactory: (inApp: InAppChannel, email: EmailChannel): NotificationChannel[] => [
        inApp,
        email,
      ],
      inject: [InAppChannel, EmailChannel],
    },
  ],
  exports: [NotificationDispatcher],
})
export class NotificationModule {}
```

- [ ] **Step 4: Register `NotificationModule` in `src/app.module.ts`**

Add `NotificationModule` to the `imports` array (import it at the top).

- [ ] **Step 5: Run module test + typecheck**

Run: `npm test -- notifications.module && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/notifications/notifications.module.ts src/notifications/notifications.module.spec.ts src/app.module.ts
git commit -m "feat: wire NotificationModule with channels, dispatcher and transporter"
```

---

### Task 12: ReminderService (create/list/cancel + enqueue/dequeue)

**Files:**
- Create: `src/publishing/reminder.service.ts`
- Test: `src/publishing/reminder.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; a BullMQ `Queue` injected via `@InjectQueue(REMINDER_QUEUE)`; errors `remindAtRequired`, `remindAtInPast`, `notFound`, `reminderAlreadySent`; `REMINDER_JOB`.
- Produces: `class ReminderService` with
  - `create(tenantId: string, dto: { postId: string; channels?: NotificationChannelId[]; remindAt?: string }): Promise<ReminderDto[]>` — resolves `remindAt` (dto.remindAt ?? `post.scheduledAt`); neither → `remindAtRequired()`; past → `remindAtInPast()`; post missing/cross-tenant → `notFound()`. Default channels `['in_app','email']`. For each channel: create `Reminder` row (`status='scheduled'`), add a delayed job `{ reminderId, postId, tenantId, channel }` with `delay = remindAt - now`, `jobId = reminderId` (idempotency key), then persist the `jobId`.
  - `list(tenantId: string, postId: string): Promise<ReminderDto[]>` — `where: { tenantId, postId }`.
  - `cancel(tenantId: string, id: string): Promise<ReminderDto>` — missing/cross-tenant → `notFound()`; `status==='sent'` → `reminderAlreadySent()`; else set `status='cancelled'` and remove the job from the queue.
  - private `toDto(row): ReminderDto` mapping dates to ISO.

- [ ] **Step 1: Write failing tests**

`src/publishing/reminder.service.spec.ts`:

```ts
import { ReminderService } from './reminder.service';
import { REMINDER_JOB } from './reminder.constants';

function setup(overrides: { post?: any } = {}) {
  const reminderRows: any[] = [];
  const prisma = {
    post: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.post === undefined
          ? { id: 'p1', tenantId: 't1', scheduledAt: new Date('2999-01-01T00:00:00.000Z') }
          : overrides.post,
      ),
    },
    reminder: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `r${reminderRows.length + 1}`, createdAt: new Date(), ...data };
        reminderRows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = reminderRows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      findMany: jest.fn().mockResolvedValue(reminderRows),
      findFirst: jest.fn(async ({ where }: any) =>
        reminderRows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      ),
    },
  } as any;
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }), remove: jest.fn() } as any;
  return { prisma, queue, svc: new ReminderService(prisma, queue), reminderRows };
}

describe('ReminderService.create', () => {
  it('defaults to in_app + email channels and enqueues a delayed job each', async () => {
    const { svc, prisma, queue } = setup();
    const out = await svc.create('t1', { postId: 'p1' });
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.channel).sort()).toEqual(['email', 'in_app']);
    expect(prisma.reminder.create).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    const addArgs = queue.add.mock.calls[0];
    expect(addArgs[0]).toBe(REMINDER_JOB);
    expect(addArgs[1]).toMatchObject({ postId: 'p1', tenantId: 't1' });
    expect(addArgs[2].delay).toBeGreaterThan(0);
    expect(addArgs[2].jobId).toBe(out[0].id); // idempotent on reminderId
  });

  it('uses an explicit remindAt and selected channels', async () => {
    const { svc, queue } = setup();
    const future = new Date(Date.now() + 60_000).toISOString();
    const out = await svc.create('t1', { postId: 'p1', channels: ['in_app'], remindAt: future });
    expect(out).toHaveLength(1);
    expect(out[0].channel).toBe('in_app');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('throws remind_at_required when neither remindAt nor scheduledAt exist', async () => {
    const { svc } = setup({ post: { id: 'p1', tenantId: 't1', scheduledAt: null } });
    await expect(svc.create('t1', { postId: 'p1' })).rejects.toMatchObject({
      response: { error: 'remind_at_required' },
    });
  });

  it('throws remind_at_in_past for a past remindAt', async () => {
    const { svc } = setup();
    await expect(
      svc.create('t1', { postId: 'p1', remindAt: '2000-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ response: { error: 'remind_at_in_past' } });
  });

  it('throws not_found for a missing or cross-tenant post', async () => {
    const { svc } = setup({ post: null });
    await expect(svc.create('t1', { postId: 'nope' })).rejects.toMatchObject({
      response: { error: 'not_found' },
    });
  });
});

describe('ReminderService.cancel', () => {
  it('cancels a scheduled reminder and removes the job', async () => {
    const { svc, queue } = setup();
    const [created] = await svc.create('t1', { postId: 'p1', channels: ['in_app'] });
    const res = await svc.cancel('t1', created.id);
    expect(res.status).toBe('cancelled');
    expect(queue.remove).toHaveBeenCalledWith(created.id);
  });

  it('throws reminder_already_sent for a sent reminder', async () => {
    const { svc, reminderRows } = setup();
    const [created] = await svc.create('t1', { postId: 'p1', channels: ['in_app'] });
    reminderRows.find((r) => r.id === created.id).status = 'sent';
    await expect(svc.cancel('t1', created.id)).rejects.toMatchObject({
      response: { error: 'reminder_already_sent' },
    });
  });

  it('throws not_found for a cross-tenant reminder', async () => {
    const { svc } = setup();
    await expect(svc.cancel('other', 'r1')).rejects.toMatchObject({
      response: { error: 'not_found' },
    });
  });
});

describe('ReminderService.list', () => {
  it('lists reminders scoped to tenant + post', async () => {
    const { svc, prisma } = setup();
    await svc.create('t1', { postId: 'p1', channels: ['in_app'] });
    await svc.list('t1', 'p1');
    expect(prisma.reminder.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', postId: 'p1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reminder.service`
Expected: FAIL — cannot find `./reminder.service`.

- [ ] **Step 3: Implement `src/publishing/reminder.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_QUEUE, REMINDER_JOB } from './reminder.constants';
import type { NotificationChannelId, ReminderDto, ReminderStatus } from './publishing.types';
import { notFound, remindAtInPast, remindAtRequired, reminderAlreadySent } from './errors';

interface CreateReminderInput {
  postId: string;
  channels?: NotificationChannelId[];
  remindAt?: string;
}

const DEFAULT_CHANNELS: NotificationChannelId[] = ['in_app', 'email'];

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(REMINDER_QUEUE) private readonly queue: Queue,
  ) {}

  async create(tenantId: string, dto: CreateReminderInput): Promise<ReminderDto[]> {
    const post = await this.prisma.post.findFirst({
      where: { id: dto.postId, tenantId },
    });
    if (!post) throw notFound();

    const remindAtRaw = dto.remindAt ?? post.scheduledAt?.toISOString();
    if (!remindAtRaw) throw remindAtRequired();
    const remindAt = new Date(remindAtRaw);
    const delay = remindAt.getTime() - Date.now();
    if (delay <= 0) throw remindAtInPast();

    const channels = dto.channels?.length ? dto.channels : DEFAULT_CHANNELS;
    const out: ReminderDto[] = [];
    for (const channel of channels) {
      const row = await this.prisma.reminder.create({
        data: { tenantId, postId: dto.postId, channel, remindAt, status: 'scheduled' },
      });
      await this.queue.add(
        REMINDER_JOB,
        { reminderId: row.id, postId: dto.postId, tenantId, channel },
        { delay, jobId: row.id },
      );
      const withJob = await this.prisma.reminder.update({
        where: { id: row.id },
        data: { jobId: row.id },
      });
      out.push(this.toDto(withJob));
    }
    return out;
  }

  async list(tenantId: string, postId: string): Promise<ReminderDto[]> {
    const rows = await this.prisma.reminder.findMany({
      where: { tenantId, postId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async cancel(tenantId: string, id: string): Promise<ReminderDto> {
    const existing = await this.prisma.reminder.findFirst({ where: { id, tenantId } });
    if (!existing) throw notFound();
    if (existing.status === 'sent') throw reminderAlreadySent();
    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.queue.remove(id);
    return this.toDto(updated);
  }

  private toDto(row: {
    id: string;
    tenantId: string;
    postId: string;
    channel: string;
    remindAt: Date;
    status: string;
    createdAt: Date;
  }): ReminderDto {
    return {
      id: row.id,
      tenantId: row.tenantId,
      postId: row.postId,
      channel: row.channel as NotificationChannelId,
      remindAt: row.remindAt.toISOString(),
      status: row.status as ReminderStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reminder.service`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/publishing/reminder.service.ts src/publishing/reminder.service.spec.ts
git commit -m "feat: add ReminderService with delayed jobs and cancellation"
```

---

### Task 13: ReminderProcessor (BullMQ worker → dispatcher)

**Files:**
- Create: `src/publishing/reminder.processor.ts`
- Test: `src/publishing/reminder.processor.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `ExportService.buildPayload`; `NotificationDispatcher.dispatch`; `REMINDER_QUEUE`; `WorkerHost` from `@nestjs/bullmq`.
- Produces: `class ReminderProcessor extends WorkerHost` with
  `process(job: { data: { reminderId, postId, tenantId, channel } }): Promise<void>`:
  1. Load the `Reminder`; if missing or `status !== 'scheduled'` → return silently (idempotency / already sent / cancelled — guards duplicate delivery).
  2. Build `ExportPayload` via `ExportService`; if the post is gone/not-approved (throws), set the reminder `status='cancelled'` and return (no orphan reminder).
  3. Build `ReminderNotification` and `dispatch(channel, ...)`.
  4. Set `status = result.delivered ? 'sent' : 'failed'`.

- [ ] **Step 1: Write failing tests**

`src/publishing/reminder.processor.spec.ts`:

```ts
import { ReminderProcessor } from './reminder.processor';

function setup(opts: {
  reminder?: any;
  buildPayload?: jest.Mock;
  dispatch?: jest.Mock;
} = {}) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    reminder: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.reminder === undefined
            ? { id: 'r1', status: 'scheduled' }
            : opts.reminder,
        ),
      update,
    },
  } as any;
  const exportSvc = {
    buildPayload:
      opts.buildPayload ??
      jest.fn().mockResolvedValue({
        postId: 'p1',
        platform: 'x',
        formattedText: 'ready',
        deepLink: 'https://x.com/intent/post',
        charCount: 5,
        limitMax: 280,
        notes: [],
      }),
  } as any;
  const dispatcher = {
    dispatch: opts.dispatch ?? jest.fn().mockResolvedValue({ delivered: true }),
  } as any;
  const proc = new ReminderProcessor(prisma, exportSvc, dispatcher);
  return { proc, prisma, update, exportSvc, dispatcher };
}

const job = (data: any) => ({ data } as any);

describe('ReminderProcessor', () => {
  it('delivers and marks the reminder sent', async () => {
    const { proc, update, dispatcher } = setup();
    await proc.process(
      job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith('in_app', expect.objectContaining({
      tenantId: 't1',
      postId: 'p1',
    }));
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'sent' } });
  });

  it('marks failed when the channel does not deliver (no throw)', async () => {
    const { proc, update } = setup({
      dispatch: jest.fn().mockResolvedValue({ delivered: false, error: 'x' }),
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'email' }));
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'failed' } });
  });

  it('is idempotent: skips a reminder already sent', async () => {
    const { proc, update, dispatcher } = setup({ reminder: { id: 'r1', status: 'sent' } });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('skips a missing reminder silently', async () => {
    const { proc, dispatcher } = setup({ reminder: null });
    await proc.process(job({ reminderId: 'gone', postId: 'p1', tenantId: 't1', channel: 'in_app' }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('cancels the reminder quietly when the post is gone/not-approved', async () => {
    const { proc, update, dispatcher } = setup({
      buildPayload: jest.fn().mockRejectedValue(new Error('not approved')),
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'cancelled' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reminder.processor`
Expected: FAIL — cannot find `./reminder.processor`.

- [ ] **Step 3: Implement `src/publishing/reminder.processor.ts`**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ExportService } from './export.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { REMINDER_QUEUE } from './reminder.constants';
import type { NotificationChannelId } from './publishing.types';
import type { ReminderNotification } from '../notifications/notification.types';

interface ReminderJobData {
  reminderId: string;
  postId: string;
  tenantId: string;
  channel: NotificationChannelId;
}

@Processor(REMINDER_QUEUE)
export class ReminderProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: ExportService,
    private readonly dispatcher: NotificationDispatcher,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    const { reminderId, postId, tenantId, channel } = job.data;

    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    // Idempotency: only a still-scheduled reminder is delivered (guards duplicate delivery).
    if (!reminder || reminder.status !== 'scheduled') return;

    let exportPayload;
    try {
      exportPayload = await this.exportService.buildPayload(tenantId, postId);
    } catch {
      // Post deleted / changed away from approved before maturity: drop quietly.
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'cancelled' },
      });
      return;
    }

    const notification: ReminderNotification = {
      tenantId,
      postId,
      export: exportPayload,
      remindAt: reminder.remindAt.toISOString(),
    };
    const result = await this.dispatcher.dispatch(channel, notification);
    await this.prisma.reminder.update({
      where: { id: reminderId },
      data: { status: result.delivered ? 'sent' : 'failed' },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reminder.processor`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/publishing/reminder.processor.ts src/publishing/reminder.processor.spec.ts
git commit -m "feat: add ReminderProcessor delivering matured reminders via dispatcher"
```

---

### Task 14: MarkPublishedService (approved → published + cancel reminders)

**Files:**
- Create: `src/publishing/mark-published.service.ts`
- Test: `src/publishing/mark-published.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; the BullMQ `Queue` (`@InjectQueue(REMINDER_QUEUE)`) to remove pending jobs; errors `notFound`, `invalidStatusTransition`.
- Produces: `class MarkPublishedService` with
  `markPublished(tenantId: string, postId: string, publishedAt?: string): Promise<MarkPublishedResult>`:
  - Load `Post` where `{ id, tenantId }`; missing → `notFound()`.
  - `status !== 'approved'` → `invalidStatusTransition(status)`.
  - Set `status='published'`, `publishedAt` (dto or now).
  - Cancel pending scheduled reminders for the post: `updateMany({ where: { postId, tenantId, status: 'scheduled' }, data: { status: 'cancelled' } })` and remove each job from the queue.

- [ ] **Step 1: Write failing tests**

`src/publishing/mark-published.service.spec.ts`:

```ts
import { MarkPublishedService } from './mark-published.service';

function setup(post: any, scheduled: any[] = []) {
  const prisma = {
    post: {
      findFirst: jest.fn().mockResolvedValue(post),
      update: jest.fn(async ({ data }: any) => ({ ...post, ...data })),
    },
    reminder: {
      findMany: jest.fn().mockResolvedValue(scheduled),
      updateMany: jest.fn().mockResolvedValue({ count: scheduled.length }),
    },
  } as any;
  const queue = { remove: jest.fn() } as any;
  return { prisma, queue, svc: new MarkPublishedService(prisma, queue) };
}

describe('MarkPublishedService', () => {
  it('moves approved -> published and returns the result', async () => {
    const { svc } = setup({ id: 'p1', tenantId: 't1', status: 'approved' });
    const res = await svc.markPublished('t1', 'p1');
    expect(res.postId).toBe('p1');
    expect(res.status).toBe('published');
    expect(typeof res.publishedAt).toBe('string');
  });

  it('honors an explicit publishedAt', async () => {
    const { svc } = setup({ id: 'p1', tenantId: 't1', status: 'approved' });
    const when = '2026-06-30T12:00:00.000Z';
    const res = await svc.markPublished('t1', 'p1', when);
    expect(res.publishedAt).toBe(when);
  });

  it('cancels pending scheduled reminders and removes their jobs', async () => {
    const { svc, prisma, queue } = setup({ id: 'p1', tenantId: 't1', status: 'approved' }, [
      { id: 'r1' },
      { id: 'r2' },
    ]);
    await svc.markPublished('t1', 'p1');
    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { postId: 'p1', tenantId: 't1', status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    expect(queue.remove).toHaveBeenCalledWith('r1');
    expect(queue.remove).toHaveBeenCalledWith('r2');
  });

  it('throws invalid_status_transition for a non-approved post', async () => {
    const { svc } = setup({ id: 'p1', tenantId: 't1', status: 'draft' });
    await expect(svc.markPublished('t1', 'p1')).rejects.toMatchObject({
      response: { error: 'invalid_status_transition' },
    });
  });

  it('throws not_found for a missing or cross-tenant post', async () => {
    const { svc } = setup(null);
    await expect(svc.markPublished('t1', 'nope')).rejects.toMatchObject({
      response: { error: 'not_found' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mark-published.service`
Expected: FAIL — cannot find `./mark-published.service`.

- [ ] **Step 3: Implement `src/publishing/mark-published.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_QUEUE } from './reminder.constants';
import type { MarkPublishedResult } from './publishing.types';
import { invalidStatusTransition, notFound } from './errors';

@Injectable()
export class MarkPublishedService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(REMINDER_QUEUE) private readonly queue: Queue,
  ) {}

  async markPublished(
    tenantId: string,
    postId: string,
    publishedAt?: string,
  ): Promise<MarkPublishedResult> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, tenantId } });
    if (!post) throw notFound();
    if (post.status !== 'approved') throw invalidStatusTransition(post.status);

    const when = publishedAt ? new Date(publishedAt) : new Date();
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: 'published', publishedAt: when },
    });

    // No reminders needed after publishing: cancel pending and dequeue their jobs.
    const pending = await this.prisma.reminder.findMany({
      where: { postId, tenantId, status: 'scheduled' },
    });
    await this.prisma.reminder.updateMany({
      where: { postId, tenantId, status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    for (const r of pending) {
      await this.queue.remove(r.id);
    }

    return { postId, status: 'published', publishedAt: when.toISOString() };
  }
}
```

- [ ] **Step 4: Add `publishedAt` to `Post` (NEW migration) if not present**

The foundation `Post` model does not define `publishedAt`. Add it (still LR-004-safe — a new migration, not an edit of an old one). Append to `prisma/schema.prisma` inside the existing `Post` model the field:

```prisma
  publishedAt    DateTime?   // set by Phase 5 mark-published
```

Then run: `npx prisma migrate dev --name add_post_published_at`
Expected: a new migration created and applied; client regenerated.

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- mark-published.service && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/publishing/mark-published.service.ts src/publishing/mark-published.service.spec.ts prisma/schema.prisma prisma/migrations
git commit -m "feat: add MarkPublishedService and post.publishedAt migration"
```

---

### Task 15: DTOs (validation) for publishing requests

**Files:**
- Create: `src/publishing/dto/create-reminder.dto.ts`
- Create: `src/publishing/dto/mark-published.dto.ts`
- Test: `src/publishing/dto/create-reminder.dto.spec.ts`

**Interfaces:**
- Produces:
  - `class CreateReminderDto { postId: string; channels?: NotificationChannelId[]; remindAt?: string }`
  - `class MarkPublishedDto { publishedAt?: string }`
- Consumes: `class-validator`/`class-transformer` (install if not present).

- [ ] **Step 1: Install validation deps (if missing) and enable the global pipe**

```bash
npm i class-validator class-transformer
```

In `src/main.ts`, ensure a global validation pipe is registered after `setGlobalPrefix`:

```ts
import { ValidationPipe } from '@nestjs/common';
// ...
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

- [ ] **Step 2: Write failing DTO test**

`src/publishing/dto/create-reminder.dto.spec.ts`:

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReminderDto } from './create-reminder.dto';

describe('CreateReminderDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateReminderDto, {
      postId: 'p1',
      channels: ['in_app', 'email'],
      remindAt: '2026-07-01T09:00:00.000Z',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a missing postId', async () => {
    const dto = plainToInstance(CreateReminderDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'postId')).toBe(true);
  });

  it('rejects an unknown channel value', async () => {
    const dto = plainToInstance(CreateReminderDto, { postId: 'p1', channels: ['sms'] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'channels')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- create-reminder.dto`
Expected: FAIL — cannot find `./create-reminder.dto`.

- [ ] **Step 4: Implement the DTOs**

`src/publishing/dto/create-reminder.dto.ts`:

```ts
import { IsArray, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import type { NotificationChannelId } from '../publishing.types';

export class CreateReminderDto {
  @IsString()
  postId!: string;

  @IsOptional()
  @IsArray()
  @IsIn(['in_app', 'email'], { each: true })
  channels?: NotificationChannelId[];

  @IsOptional()
  @IsISO8601()
  remindAt?: string;
}
```

`src/publishing/dto/mark-published.dto.ts`:

```ts
import { IsISO8601, IsOptional } from 'class-validator';

export class MarkPublishedDto {
  @IsOptional()
  @IsISO8601()
  publishedAt?: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- create-reminder.dto`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/publishing/dto src/main.ts package.json package-lock.json
git commit -m "feat: add publishing request DTOs and global validation pipe"
```

---

### Task 16: PublishingController (the 5 routes)

**Files:**
- Create: `src/publishing/publishing.controller.ts`
- Test: `src/publishing/publishing.controller.spec.ts`

**Interfaces:**
- Consumes: `ExportService.buildPayload`, `ReminderService` (`create`/`list`/`cancel`), `MarkPublishedService.markPublished`; `@CurrentTenant() ctx: TenantContext`; guards; DTOs; `Platform`.
- Produces routes (all under `api/v1`, guarded):
  - `GET /posts/:id/export?platform=` → `ExportPayload`
  - `POST /posts/:id/mark-published` (body `MarkPublishedDto`) → `MarkPublishedResult`
  - `POST /reminders` (body `CreateReminderDto`) → `ReminderDto[]`
  - `DELETE /reminders/:id` → `ReminderDto`
  - `GET /posts/:id/reminders` → `ReminderDto[]`

- [ ] **Step 1: Write failing controller tests**

`src/publishing/publishing.controller.spec.ts`:

```ts
import { PublishingController } from './publishing.controller';

const ctx = { userId: 'u1', tenantId: 't1' };

function make(parts: any) {
  return new PublishingController(
    parts.exportService ?? { buildPayload: jest.fn() },
    parts.reminderService ?? { create: jest.fn(), list: jest.fn(), cancel: jest.fn() },
    parts.markPublished ?? { markPublished: jest.fn() },
  );
}

describe('PublishingController', () => {
  it('GET export passes tenant + platform through', async () => {
    const buildPayload = jest.fn().mockResolvedValue({ postId: 'p1' });
    const ctrl = make({ exportService: { buildPayload } });
    const res = await ctrl.export(ctx as any, 'p1', 'x');
    expect(res).toEqual({ postId: 'p1' });
    expect(buildPayload).toHaveBeenCalledWith('t1', 'p1', 'x');
  });

  it('GET export defaults platform to undefined when not provided', async () => {
    const buildPayload = jest.fn().mockResolvedValue({});
    const ctrl = make({ exportService: { buildPayload } });
    await ctrl.export(ctx as any, 'p1', undefined);
    expect(buildPayload).toHaveBeenCalledWith('t1', 'p1', undefined);
  });

  it('POST mark-published passes tenant + publishedAt', async () => {
    const markPublished = jest.fn().mockResolvedValue({ status: 'published' });
    const ctrl = make({ markPublished: { markPublished } });
    await ctrl.markPublished(ctx as any, 'p1', { publishedAt: '2026-06-30T00:00:00.000Z' });
    expect(markPublished).toHaveBeenCalledWith('t1', 'p1', '2026-06-30T00:00:00.000Z');
  });

  it('POST reminders forwards the dto', async () => {
    const create = jest.fn().mockResolvedValue([{ id: 'r1' }]);
    const ctrl = make({ reminderService: { create, list: jest.fn(), cancel: jest.fn() } });
    const dto = { postId: 'p1', channels: ['in_app'] };
    const res = await ctrl.createReminder(ctx as any, dto as any);
    expect(res).toEqual([{ id: 'r1' }]);
    expect(create).toHaveBeenCalledWith('t1', dto);
  });

  it('DELETE reminders/:id cancels', async () => {
    const cancel = jest.fn().mockResolvedValue({ id: 'r1', status: 'cancelled' });
    const ctrl = make({ reminderService: { create: jest.fn(), list: jest.fn(), cancel } });
    const res = await ctrl.cancelReminder(ctx as any, 'r1');
    expect(res.status).toBe('cancelled');
    expect(cancel).toHaveBeenCalledWith('t1', 'r1');
  });

  it('GET posts/:id/reminders lists', async () => {
    const list = jest.fn().mockResolvedValue([{ id: 'r1' }]);
    const ctrl = make({ reminderService: { create: jest.fn(), list, cancel: jest.fn() } });
    const res = await ctrl.listReminders(ctx as any, 'p1');
    expect(res).toEqual([{ id: 'r1' }]);
    expect(list).toHaveBeenCalledWith('t1', 'p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publishing.controller`
Expected: FAIL — cannot find `./publishing.controller`.

- [ ] **Step 3: Implement `src/publishing/publishing.controller.ts`**

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import type { TenantContext } from '../tenant/tenant-context';
import type { Platform } from '../config/platform-limits';
import { ExportService } from './export.service';
import { ReminderService } from './reminder.service';
import { MarkPublishedService } from './mark-published.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { MarkPublishedDto } from './dto/mark-published.dto';

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard)
export class PublishingController {
  constructor(
    private readonly exportService: ExportService,
    private readonly reminderService: ReminderService,
    private readonly markPublishedService: MarkPublishedService,
  ) {}

  @Get('posts/:id/export')
  export(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Query('platform') platform?: Platform,
  ) {
    return this.exportService.buildPayload(ctx.tenantId, id, platform);
  }

  @Post('posts/:id/mark-published')
  markPublished(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: MarkPublishedDto,
  ) {
    return this.markPublishedService.markPublished(ctx.tenantId, id, dto.publishedAt);
  }

  @Post('reminders')
  createReminder(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateReminderDto) {
    return this.reminderService.create(ctx.tenantId, dto);
  }

  @Delete('reminders/:id')
  cancelReminder(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.reminderService.cancel(ctx.tenantId, id);
  }

  @Get('posts/:id/reminders')
  listReminders(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.reminderService.list(ctx.tenantId, id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- publishing.controller`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/publishing/publishing.controller.ts src/publishing/publishing.controller.spec.ts
git commit -m "feat: add PublishingController with export, reminders, mark-published"
```

---

### Task 17: PublishingModule (wire everything) + app registration

**Files:**
- Create: `src/publishing/publishing.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: `PublishingModule` importing `BullModule.registerQueue({ name: REMINDER_QUEUE })` and `NotificationModule` (for `NotificationDispatcher`); providing `ExportFormatter`, `DeepLinkBuilder`, `ExportService`, `ReminderService`, `MarkPublishedService`, `ReminderProcessor`; controller `PublishingController`.
- Consumes: all phase-5 services; `NotificationDispatcher` (exported by `NotificationModule`).

- [ ] **Step 1: Write failing module test**

`src/publishing/publishing.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PublishingModule } from './publishing.module';
import { PublishingController } from './publishing.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_QUEUE } from './reminder.constants';
import { MAIL_TRANSPORTER } from '../notifications/email.channel';

describe('PublishingModule', () => {
  it('compiles and resolves the controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublishingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(getQueueToken(REMINDER_QUEUE))
      .useValue({ add: jest.fn(), remove: jest.fn() })
      .overrideProvider(MAIL_TRANSPORTER)
      .useValue({ sendMail: jest.fn() })
      .compile();
    expect(moduleRef.get(PublishingController)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publishing.module`
Expected: FAIL — cannot find `./publishing.module`.

- [ ] **Step 3: Implement `src/publishing/publishing.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationModule } from '../notifications/notifications.module';
import { REMINDER_QUEUE } from './reminder.constants';
import { ExportFormatter } from './export-formatter.service';
import { DeepLinkBuilder } from './deep-link-builder.service';
import { ExportService } from './export.service';
import { ReminderService } from './reminder.service';
import { MarkPublishedService } from './mark-published.service';
import { ReminderProcessor } from './reminder.processor';
import { PublishingController } from './publishing.controller';

@Module({
  imports: [BullModule.registerQueue({ name: REMINDER_QUEUE }), NotificationModule],
  controllers: [PublishingController],
  providers: [
    ExportFormatter,
    DeepLinkBuilder,
    ExportService,
    ReminderService,
    MarkPublishedService,
    ReminderProcessor,
  ],
})
export class PublishingModule {}
```

- [ ] **Step 4: Register `PublishingModule` in `src/app.module.ts`**

Add `PublishingModule` to the `imports` array (import it at the top). The final `imports` list: `ConfigModule.forRoot(...)`, `PrismaModule`, `HealthModule`, `BullModule.forRoot(...)`, `NotificationModule`, `PublishingModule`.

- [ ] **Step 5: Run test + full suite + typecheck**

Run: `npm test -- publishing.module && npm test && npm run typecheck`
Expected: PASS for all; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/publishing/publishing.module.ts src/publishing/publishing.module.spec.ts src/app.module.ts
git commit -m "feat: wire PublishingModule and register in app module"
```

---

### Task 18: Env example + e2e smoke for the export route

**Files:**
- Modify: `.env.example`
- Create: `test/publishing.e2e-spec.ts`
- Modify: `package.json` (add `test:e2e` script + e2e jest config if not present)

**Interfaces:**
- Produces: documented SMTP env vars; an e2e test that boots the app with mocked guards + Prisma and asserts `GET /api/v1/posts/:id/export` returns a well-formed `ExportPayload`.

- [ ] **Step 1: Add SMTP vars to `.env.example`**

Append:

```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
```

- [ ] **Step 2: Add the e2e jest config + script to `package.json`**

Add a script:

```json
"test:e2e": "jest --config ./test/jest-e2e.json"
```

Create `test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node"
}
```

- [ ] **Step 3: Write the e2e smoke test**

`test/publishing.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { PublishingModule } from '../src/publishing/publishing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REMINDER_QUEUE } from '../src/publishing/reminder.constants';
import { MAIL_TRANSPORTER } from '../src/notifications/email.channel';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TenantGuard } from '../src/tenant/tenant.guard';

const approvedPost = {
  id: 'p1',
  tenantId: 't1',
  platform: 'linkedin',
  status: 'approved',
  text: 'Hello world',
  hashtags: ['#a', '#b', '#c'],
  image: { url: 'https://img/p1.png' },
  citations: [],
};

describe('Publishing (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const allow = { canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest();
      req.tenantContext = { userId: 'u1', tenantId: 't1' };
      return true;
    } };
    const moduleRef = await Test.createTestingModule({
      imports: [PublishingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ post: { findFirst: async () => approvedPost } })
      .overrideProvider(getQueueToken(REMINDER_QUEUE))
      .useValue({ add: jest.fn(), remove: jest.fn() })
      .overrideProvider(MAIL_TRANSPORTER)
      .useValue({ sendMail: jest.fn() })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(TenantGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/posts/p1/export returns a well-formed payload', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/posts/p1/export?platform=linkedin')
      .expect(200);
    expect(res.body.postId).toBe('p1');
    expect(res.body.platform).toBe('linkedin');
    expect(res.body.imageUrl).toBe('https://img/p1.png');
    expect(res.body.formattedText).toContain('Hello world');
    expect(res.body.limitMax).toBe(3000);
    expect(res.body.deepLink).toBe('https://www.linkedin.com/feed/?shareActive=true');
  });
});
```

- [ ] **Step 4: Install supertest and run the e2e test**

```bash
npm i -D supertest @types/supertest
npm run test:e2e -- publishing
```

Expected: PASS — the export route returns the payload above.

- [ ] **Step 5: Commit**

```bash
git add .env.example test/publishing.e2e-spec.ts test/jest-e2e.json package.json package-lock.json
git commit -m "test: add publishing export e2e smoke and smtp env vars"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| `GET /posts/:id/export` (FR-11) | 4 (formatter), 5 (deep link), 6 (assembly), 16 (route) |
| `POST /posts/:id/mark-published` (FR-13) | 14 (service), 16 (route) |
| `POST /reminders` (FR-12) | 12 (service), 16 (route) |
| `DELETE /reminders/:id` | 12 (cancel), 16 (route) |
| `GET /posts/:id/reminders` | 12 (list), 16 (route) |
| `GET /notifications` | 10 |
| `PATCH /notifications/:id/read` | 10 |
| `ExportFormatter` (platform-limits + twitter-text) | 4 |
| `DeepLinkBuilder` | 5 |
| `ReminderScheduler` (BullMQ delayed jobs) | 12 (producer), 13 (worker) |
| `NotificationDispatcher` + `NotificationChannel` | 9 |
| `InAppChannel` | 7 |
| `EmailChannel` (Arabic RTL) | 8 |
| Prisma `Reminder` + `Notification` (NEW migration) | 2 |
| Types (`ExportPayload`, `Reminder`, `Notification`, channel id, `DeliveryResult`, ...) | 3 |
| Error table (not_approved/exceeds_platform_limit/invalid_status_transition/remind_at_required/remind_at_in_past/not_found/reminder_already_sent) | 3 (helpers), used in 6/10/12/14 |
| Flow 1 (export & manual publish) | 4–6, 16 |
| Flow 2 (scheduled reminder) | 12, 13, 7, 8, 9 |
| Flow 3 (mark published) | 14 |
| AC-1 (export obeys limits, imageUrl, deepLink) | 4, 6, 18 |
| AC-2 (text separate from image) | 6 (`imageUrl` set separately), 18 |
| AC-3 (deepLink opens composer; X injects text; notes) | 5, 4 |
| AC-4 (reminders via in_app + email by default; post ready inside reminder) | 12, 13 |
| AC-5 (one channel's failure doesn't block others) | 9 (isolated dispatch), 13 (per-channel job + status) |
| AC-6 (add WhatsappChannel = new impl + register; no scheduler/route change) | 11 (`NOTIFICATION_CHANNELS` factory), 9 (id-based resolve) |
| AC-7 (approved→published only; else 409; cancel pending reminders) | 14 |
| AC-8 (tenant isolation; cross-tenant → 404) | 6, 10, 12, 14 (all `where: { ..., tenantId }`) |
| AC-9 (limits from config, twitter-text, exceed → 422) | 4 |
| AC-10 (InAppChannel writes Notification; list tenant-only newest-first + unreadOnly; read sets readAt; cross-tenant → 404) | 7, 10 |
| Error: post deleted/changed before maturity → cancel quietly | 13 |
| Idempotent reminder delivery (status != 'sent') | 13 (skip non-scheduled), 12 (jobId = reminderId) |

Every spec route, service, type, flow, error-table row, and AC-1..AC-10 maps to a task. No gaps.

**2. Placeholder scan**

No "TBD/TODO/implement later/handle edge cases" appears. Every code step contains full code. The only cross-task reference ("the export route returns the payload above" in Task 18) restates concrete asserted values, not deferred code. Arabic strings are present only in user-facing places (in-app `title`/`body` in Task 7, email subject/body in Task 8, formatter `notes` in Task 4) — all other identifiers/comments are English.

**3. Type consistency**

- `NotificationChannelId = 'in_app' | 'email'`, `ReminderStatus`, `ExportPayload`, `ExportLink`, `MarkPublishedResult`, `ReminderDto` defined once in Task 3 and imported everywhere (`publishing.types.ts`).
- `ReminderNotification`, `DeliveryResult`, `NotificationChannel`, `NOTIFICATION_CHANNELS` defined once in Task 3 (`notification.types.ts`); `MAIL_TRANSPORTER`/`MailTransporter` defined once in Task 8 and re-imported by Tasks 11/17/18.
- `ExportFormatter.format` returns `FormatResult` (Task 4) consumed by `ExportService` (Task 6) — field names (`formattedText`, `charCount`, `limitMax`, `link`, `notes`) match.
- `ReminderService.create/list/cancel` (Task 12) signatures match the controller calls (Task 16) and the `markPublished(tenantId, postId, publishedAt?)` signature (Task 14) matches its controller call (Task 16).
- Queue constants `REMINDER_QUEUE='reminders'`, `REMINDER_JOB='deliver-reminder'` (Task 1) used identically in Tasks 12/13/14/17/18.
- `Reminder.status` string union and `Notification` fields in the schema (Task 2) match the DTO/types and the services' `data`/`where` shapes.
- Error helper names (`notApproved`, `exceedsPlatformLimit`, `invalidStatusTransition`, `remindAtRequired`, `remindAtInPast`, `notFound`, `reminderAlreadySent`) defined in Task 3 and called with matching arity in Tasks 4/6/10/12/14.

No naming or signature drift found.

**4. Intentionally deferred (with reason)**

- **Auth/tenant seam** (`JwtAuthGuard`, `TenantGuard`, `@CurrentTenant`, `TenantContext`) — assumed from Phase 3 per the brief; imported, not re-implemented.
- **WhatsappChannel** — out of scope (V2); architecture proven extensible by Task 11's `NOTIFICATION_CHANNELS` factory + Task 9's id-based resolution (AC-6 satisfied without it).
- **Auto-publishing / platform APIs** — out of scope per spec (V2).
- **Frontend (copy/download/open buttons, notification UI)** — Phase 7 per spec.
- **Device detection (app vs web deep link)** — spec says a safe web link suffices; the builder returns web links only.
