# Foundation (Sprint 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working, tested backend skeleton for أثر — a booting NestJS API, a migrated PostgreSQL schema for the core domain, the engine's typed seams (interfaces), and the platform-limits config — so the content-engine plan can build on it.

**Architecture:** NestJS (modular) + Prisma over PostgreSQL, Redis/BullMQ for async jobs, MinIO (S3-compatible) for image storage. Multi-tenant logical isolation (`tenantId`). AI generation lives behind `ContentProvider`/`ImageProvider`/`SearchProvider` interfaces (no provider called directly). This Sprint creates the skeleton + data model + seams only — no engine logic yet (see [16-معمارية-المحرّك.md](../../16-معمارية-المحرّك.md)).

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, BullMQ + ioredis (Redis 7), MinIO, Jest, Docker Compose.

## Global Constraints

- Multi-tenant logical: every domain row carries `tenantId`; no per-customer DB. (from [14-قرارات-التنفيذ.md](../../14-قرارات-التنفيذ.md))
- Code, identifiers, comments, commit messages: **English only**. Arabic only in user-facing content/strings and explicitly-requested docs.
- AI text behind `ContentProvider`; images behind `ImageProvider`; search behind `SearchProvider`. Never call Claude/OpenAI/search SDKs directly from services.
- Platform limits live in ONE config module (not scattered). Source of truth: [15-مواصفات-المنصات.md](../../15-مواصفات-المنصات.md).
- Post lifecycle states: `draft → pending_review → approved → published`.
- Every AI call (later) records a `UsageRecord` for margin tracking.
- TDD: failing test first, minimal impl, commit per task.

## File Structure

```
package.json, tsconfig.json, nest-cli.json, .env.example, .gitignore
docker-compose.yml                         # postgres, redis, minio
prisma/schema.prisma                       # domain model
src/main.ts                                # bootstrap
src/app.module.ts                          # root module
src/config/platform-limits.ts              # LinkedIn/X limits (doc 15)
src/config/platform-limits.spec.ts
src/prisma/prisma.module.ts, prisma.service.ts
src/health/health.module.ts, health.controller.ts, health.controller.spec.ts
src/engine/providers/content-provider.interface.ts   # seam (types only)
src/engine/providers/image-provider.interface.ts     # seam
src/engine/providers/search-provider.interface.ts    # seam
src/engine/types.ts                        # shared engine types (BrandProfile, Draft, FactSet...)
.github/workflows/ci.yml                   # lint + typecheck + test
```

---

### Task 1: Project scaffold (NestJS + TypeScript + tooling)

**Files:**
- Create: `package.json`, `tsconfig.json`, `nest-cli.json`, `.gitignore`, `.env.example`
- Create: `src/main.ts`, `src/app.module.ts`

**Interfaces:**
- Produces: a booting Nest app; `AppModule`; npm scripts `start:dev`, `build`, `test`, `lint`, `typecheck`.

- [ ] **Step 1: Init repo and install deps**

```bash
cd /Users/tariq/code/أثير
git init
npm init -y
npm i @nestjs/common@^10 @nestjs/core@^10 @nestjs/platform-express@^10 @nestjs/config reflect-metadata rxjs
npm i -D typescript @types/node ts-node ts-jest jest @types/jest @nestjs/cli @nestjs/testing eslint prettier
```

- [ ] **Step 2: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strict": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Add `nest-cli.json` and `.gitignore`**

`nest-cli.json`:
```json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```
`.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: Add scripts to `package.json`**

```json
"scripts": {
  "build": "nest build",
  "start:dev": "nest start --watch",
  "test": "jest",
  "lint": "eslint \"src/**/*.ts\"",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 5: Add `src/app.module.ts` and `src/main.ts`**

`src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```
`src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1'); // all routes live under /api/v1 (single source of truth)
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 6: Add jest config to `package.json`**

```json
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node"
}
```

- [ ] **Step 7: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: no errors, `dist/` produced.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold NestJS project with tooling"
```

---

### Task 2: Docker Compose (Postgres, Redis, MinIO) + env

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: local `postgres:16` on 5432, `redis:7` on 6379, `minio` on 9000/9001; `DATABASE_URL`, `REDIS_URL`, MinIO vars in `.env.example`.

- [ ] **Step 1: Add `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: athar
      POSTGRES_PASSWORD: athar
      POSTGRES_DB: athar
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: athar
      MINIO_ROOT_PASSWORD: athar12345
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 2: Add `.env.example`**

```
PORT=3000
DATABASE_URL=postgresql://athar:athar@localhost:5432/athar?schema=public
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=athar
MINIO_SECRET_KEY=athar12345
MINIO_BUCKET=athar-images
```

- [ ] **Step 3: Bring up services and verify**

Run: `docker compose up -d && docker compose ps`
Expected: postgres, redis, minio all "running".

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker compose for postgres, redis, minio"
```

---

### Task 3: Prisma schema + migration (domain model)

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: tables `Tenant, User, BrandProfile, AccountProfile, Post, ImageAsset, SourceCitation, Subscription, UsageRecord`; generated Prisma client.
- Consumes: `DATABASE_URL` from Task 2.

- [ ] **Step 1: Install Prisma**

```bash
npm i @prisma/client
npm i -D prisma
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Platform { linkedin x }
enum PostStatus { draft pending_review approved published }
enum SubscriptionStatus { trialing active past_due canceled }

model Tenant {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  users         User[]
  brandProfiles BrandProfile[]
  subscriptions Subscription[]
  usageRecords  UsageRecord[]
}

model User {
  id           String   @id @default(cuid())
  tenantId     String
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  @@index([tenantId])
}

model BrandProfile {
  id                 String   @id @default(cuid())
  tenantId           String
  tone               String
  audience           String?
  goals              String?
  topics             String[]
  prohibitions       String[]
  competitors        String[]
  keywords           String[]
  brandKit           Json     // colors, logoUrl, visualStyle, font
  learnedPreferences String   @default("")
  createdAt          DateTime @default(now())
  tenant   Tenant          @relation(fields: [tenantId], references: [id])
  accounts AccountProfile[]
  posts    Post[]
  @@index([tenantId])
}

model AccountProfile {
  id             String       @id @default(cuid())
  tenantId       String
  brandProfileId String
  platform       Platform
  handle         String?
  brandProfile   BrandProfile @relation(fields: [brandProfileId], references: [id])
  @@index([tenantId])
  @@index([brandProfileId])
}

model Post {
  id             String      @id @default(cuid())
  tenantId       String
  brandProfileId String
  platform       Platform
  status         PostStatus  @default(draft)
  text           String
  hashtags       String[]
  scheduledAt    DateTime?
  createdAt      DateTime    @default(now())
  brandProfile BrandProfile   @relation(fields: [brandProfileId], references: [id])
  image        ImageAsset?
  citations    SourceCitation[]
  @@index([tenantId])
  @@index([brandProfileId])
}

model ImageAsset {
  id           String   @id @default(cuid())
  postId       String   @unique
  url          String
  method       String   // 'gpt-image' | 'overlay-fallback'
  verifiedText String?  // text confirmed by the vision-verify step (engine stage 4)
  attempts     Int      @default(1)
  post         Post     @relation(fields: [postId], references: [id])
}

model SourceCitation {
  id        String @id @default(cuid())
  postId    String
  claim     String
  sourceUrl String
  post      Post   @relation(fields: [postId], references: [id])
  @@index([postId])
}

model Subscription {
  id                String             @id @default(cuid())
  tenantId          String
  status            SubscriptionStatus @default(trialing)
  plan              String
  trialEndsAt       DateTime?
  currentPeriodEnd  DateTime?
  cancelAtPeriodEnd Boolean            @default(false)
  createdAt         DateTime           @default(now())
  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  usageRecords UsageRecord[]
  @@index([tenantId])
}

// Phase-local tables added by their own migrations (LR-004: new migration per phase):
//   SaudiOccasion (Phase 4), Reminder (Phase 5), Invoice (Phase 6).

model UsageRecord {
  id             String   @id @default(cuid())
  tenantId       String
  subscriptionId String?
  kind           String   // 'text' | 'image' | 'search'
  units          Int
  costUsd        Float    @default(0)
  createdAt      DateTime @default(now())
  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  subscription Subscription? @relation(fields: [subscriptionId], references: [id])
  @@index([tenantId])
}
```

- [ ] **Step 3: Create migration and generate client**

Run: `npx prisma migrate dev --name init`
Expected: migration applied, client generated, no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add prisma domain schema and init migration"
```

---

### Task 4: PrismaService + module

**Files:**
- Create: `src/prisma/prisma.service.ts`, `src/prisma/prisma.module.ts`
- Test: `src/prisma/prisma.service.spec.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: injectable `PrismaService` (extends `PrismaClient`, connects on init); `PrismaModule` (global).
- Consumes: generated Prisma client from Task 3.

- [ ] **Step 1: Write failing test**

```ts
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('is a PrismaClient with $connect', () => {
    const svc = new PrismaService();
    expect(typeof svc.$connect).toBe('function');
    expect(typeof svc.onModuleInit).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prisma.service`
Expected: FAIL — cannot find `./prisma.service`.

- [ ] **Step 3: Implement service + module**

`src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```
`src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 4: Register in `app.module.ts`**

Add `PrismaModule` to `imports` array.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- prisma.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/prisma src/app.module.ts
git commit -m "feat: add PrismaService and global module"
```

---

### Task 5: Platform-limits config (LinkedIn/X — doc 15)

**Files:**
- Create: `src/config/platform-limits.ts`
- Test: `src/config/platform-limits.spec.ts`

**Interfaces:**
- Produces: `PLATFORM_LIMITS: Record<Platform, PlatformLimit>` and `getLimit(platform)`. `PlatformLimit = { maxChars; premiumMaxChars?; hookChars?; hashtags: {min,max}; images: {max; defaultSize: [w,h]}; altMaxChars }`.

- [ ] **Step 1: Write failing test**

```ts
import { getLimit, PLATFORM_LIMITS } from './platform-limits';

describe('platform-limits', () => {
  it('linkedin post cap is 3000 and 3-5 hashtags', () => {
    const l = getLimit('linkedin');
    expect(l.maxChars).toBe(3000);
    expect(l.hashtags).toEqual({ min: 3, max: 5 });
  });
  it('x free cap is 280 with premium 25000 and 1-2 hashtags', () => {
    const x = getLimit('x');
    expect(x.maxChars).toBe(280);
    expect(x.premiumMaxChars).toBe(25000);
    expect(x.hashtags).toEqual({ min: 1, max: 2 });
  });
  it('exposes both platforms', () => {
    expect(Object.keys(PLATFORM_LIMITS).sort()).toEqual(['linkedin', 'x']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- platform-limits`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement config**

```ts
export type Platform = 'linkedin' | 'x';

export interface PlatformLimit {
  maxChars: number;
  premiumMaxChars?: number;
  hookChars?: number;       // visible-before-truncation (LinkedIn mobile)
  hashtags: { min: number; max: number };
  images: { max: number; defaultSize: [number, number] };
  altMaxChars: number;
  linkRule: string;
}

export const PLATFORM_LIMITS: Record<Platform, PlatformLimit> = {
  linkedin: {
    maxChars: 3000,
    hookChars: 140,
    hashtags: { min: 3, max: 5 },
    images: { max: 20, defaultSize: [1200, 1200] },
    altMaxChars: 120,
    linkRule: 'paste url in body, remove preview card',
  },
  x: {
    maxChars: 280,
    premiumMaxChars: 25000,
    hashtags: { min: 1, max: 2 },
    images: { max: 4, defaultSize: [1200, 1200] },
    altMaxChars: 1000,
    linkRule: 'put link in a reply, not the main post',
  },
};

export function getLimit(platform: Platform): PlatformLimit {
  return PLATFORM_LIMITS[platform];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- platform-limits`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config
git commit -m "feat: add platform-limits config for linkedin and x"
```

---

### Task 6: Engine seams — shared types + provider interfaces

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/providers/content-provider.interface.ts`
- Create: `src/engine/providers/image-provider.interface.ts`
- Create: `src/engine/providers/search-provider.interface.ts`
- Test: `src/engine/types.spec.ts`

**Interfaces:**
- Produces (consumed by the engine plan): `BrandProfileInput, BrandKit, GenerationRequest, FactSet, Fact, Draft, Citation, ImageAsset, Rubric, CritiqueResult`, and `ContentProvider`, `ImageProvider`, `SearchProvider` interfaces. Type names/signatures match [16-معمارية-المحرّك.md](../../16-معمارية-المحرّك.md) exactly.

- [ ] **Step 1: Write failing test (compile-time contract guard)**

```ts
import type { ContentProvider } from './providers/content-provider.interface';
import type { Draft, FactSet } from './types';

describe('engine seams', () => {
  it('a ContentProvider stub satisfies the interface', () => {
    const stub: ContentProvider = {
      draft: async () => ({ text: '', citations: [], hashtags: [], imageBrief: '' } as Draft),
      critique: async () => ({ score: 1, passed: true, issues: [] }),
    };
    expect(typeof stub.draft).toBe('function');
    const fs: FactSet = { hasFactualClaim: false, facts: [] };
    expect(fs.facts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- engine/types`
Expected: FAIL — cannot find `./types` / interface modules.

- [ ] **Step 3: Implement `src/engine/types.ts`**

```ts
import type { Platform } from '../config/platform-limits';

export type ContentType = 'informational' | 'thought' | 'announcement' | 'engagement';

export interface BrandKit {
  colors: string[];
  logoUrl?: string;
  visualStyle: string;
  font: string;
}

export interface BrandProfileInput {
  id: string;
  tenantId: string;
  tone: string;
  topics: string[];
  audience?: string;
  goals?: string;
  prohibitions: string[];
  competitors: string[];
  keywords: string[];
  brandKit: BrandKit;
  learnedPreferences: string;
}

export interface GenerationRequest {
  brandProfile: BrandProfileInput;
  platform: Platform;
  contentType: ContentType;
  brief?: string;
  topic?: string;
}

export interface Fact { claim: string; sourceUrl: string; sourceTitle: string; confidence: number; }
export interface FactSet { hasFactualClaim: boolean; facts: Fact[]; }

export interface Citation { claim: string; sourceUrl: string; }
export interface Draft { text: string; citations: Citation[]; hashtags: string[]; imageBrief: string; }

export interface Rubric {
  toneMatch: boolean;
  sourceIntegrity: boolean;
  platformCompliance: boolean;
  prohibitions: boolean;
  clarity: boolean;
}
export interface CritiqueResult { score: number; passed: boolean; issues: string[]; }

export interface ImageAsset {
  url: string;
  verifiedText: string;
  method: 'gpt-image' | 'overlay-fallback';
  attempts: number;
}
```

- [ ] **Step 4: Implement the three provider interfaces**

`src/engine/providers/content-provider.interface.ts`:
```ts
import type { FactSet, BrandProfileInput, ContentType, Draft, Rubric, CritiqueResult } from '../types';
import type { Platform } from '../../config/platform-limits';

export interface DraftInput {
  factSet: FactSet;
  brand: BrandProfileInput;
  platform: Platform;
  contentType: ContentType;
  brief?: string;
}

export interface ContentProvider {
  draft(input: DraftInput): Promise<Draft>;
  critique(draft: Draft, rubric: Rubric): Promise<CritiqueResult>;
}
```
`src/engine/providers/image-provider.interface.ts`:
```ts
import type { BrandKit, ImageAsset } from '../types';
import type { Platform } from '../../config/platform-limits';

export interface ImageProvider {
  generateImage(brief: string, kit: BrandKit, platform: Platform): Promise<ImageAsset>;
}
```
`src/engine/providers/search-provider.interface.ts`:
```ts
import type { FactSet, BrandProfileInput } from '../types';

export interface SearchProvider {
  research(topic: string, brand: BrandProfileInput): Promise<FactSet>;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- engine/types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine
git commit -m "feat: add engine shared types and provider interface seams"
```

---

### Task 7: Health endpoint (DB connectivity smoke test)

**Files:**
- Create: `src/health/health.controller.ts`, `src/health/health.module.ts`
- Test: `src/health/health.controller.spec.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: `GET /health` → `{ status: 'ok', db: 'up' }`.
- Consumes: `PrismaService` (Task 4).

- [ ] **Step 1: Write failing test**

```ts
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('returns ok with db up when query succeeds', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: async () => [{ 1: 1 }] } }],
    }).compile();
    const ctrl = moduleRef.get(HealthController);
    await expect(ctrl.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- health`
Expected: FAIL — cannot find `./health.controller`.

- [ ] **Step 3: Implement controller + module**

`src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up' };
  }
}
```
`src/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 4: Register `HealthModule` in `app.module.ts` imports**

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- health`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/health src/app.module.ts
git commit -m "feat: add health endpoint with db smoke check"
```

---

### Task 8: CI pipeline (lint + typecheck + test)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI that runs lint, typecheck, and tests on push/PR with a Postgres service.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: athar
          POSTGRES_PASSWORD: athar
          POSTGRES_DB: athar
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://athar:athar@localhost:5432/athar?schema=public
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: Verify locally (the same commands CI runs)**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, test pipeline with postgres"
```

---

### Task 9: Repo CLAUDE.md (seed from doc 13, reconciled)

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: repo conventions doc reflecting locked decisions (gpt-image + verify, search restricted to topics, second provider OpenAI, multi-tenant logical, no auto-publish).

- [ ] **Step 1: Write `CLAUDE.md`**

Use the reconciled seed from [13-خطة-التنفيذ-التقنية.md](../../13-خطة-التنفيذ-التقنية.md) (Stack incl. OpenAI gpt-image; images = gpt-image + visual verification + overlay fallback; search = live restricted to customer topics, no RAG; AI behind ContentProvider; no auto-publish; UsageRecord tracking). Keep it English.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add repo CLAUDE.md with conventions"
```

---

## Self-Review

**Spec coverage (against [16-معمارية-المحرّك.md](../../16-معمارية-المحرّك.md) inputs + seams):** BrandProfile/BrandKit → Task 3 (schema) + Task 6 (types) ✓. Provider interfaces (Content/Image/Search) → Task 6 ✓. Platform limits → Task 5 ✓. Post lifecycle + citations + image asset + usage → Task 3 ✓. Async infra (Redis/MinIO) → Task 2 ✓. Engine STAGE LOGIC (research/draft/critique/image/assemble) is intentionally NOT here — it is the next plan, built on these seams.

**Placeholder scan:** Task 9 Step 1 references doc 13 content rather than inlining — acceptable (it is a copy-from-source doc task, not code). All code tasks contain complete code.

**Type consistency:** `BrandProfileInput`, `Draft`, `FactSet`, `ImageAsset`, `CritiqueResult`, `Platform` names match doc 16 and are used identically across Task 5/6. `ImageAsset.method` union matches schema `ImageAsset.method` string.

**Scope:** Single subsystem (foundation). Produces working, tested software (booting API + migrated DB + passing tests). The content-engine stages get their own plan.
