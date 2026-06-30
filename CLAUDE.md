# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**أثر (Athar)** — an Arabic-first SaaS that produces social-media content (LinkedIn / X) for Saudi SMBs. Per-company deep onboarding (`BrandProfile`) → a hybrid content engine (research → write → self-critique → image → assemble) → Saudi content calendar. Publishing is **manual-assisted** in this version (no auto-posting).

**Status: Sprint 0 complete.** Backend skeleton (NestJS, Prisma, platform-limits, engine seams, health endpoint, CI) is up. The commands and structure below describe what Sprint 0 stands up — they are the runtime of this repo today.

## Locked decisions (do not relitigate)

These were settled after a grilling session (2026-06-28, see [docs/blueprint/14-قرارات-التنفيذ.md](docs/blueprint/14-قرارات-التنفيذ.md)). Treat as constraints, not options:

- **Build-first:** the full PRD is built directly, no pre-build validation phase. Validation moved to a post-launch "first-batch success gate" (≥3 paying + month-2 renewal).
- **Multi-tenant logical** (`tenantId` on every domain row + encryption + permission isolation). No per-customer DB until 3+ customers.
- **AI text = Claude, behind `ContentProvider`.** AI images = **OpenAI gpt-image**, behind `ImageProvider`. Never call Claude/OpenAI/search SDKs directly from a service.
- **Images:** gpt-image writes the Arabic text *into* the image → **mandatory visual-verification loop** (a vision model reads the text back and compares; regenerate 2–3× on mismatch) → programmatic `overlay-fallback` if it keeps breaking. The primary path (gpt-image-text vs overlay) is decided by a formal **20-image gate** (Arabic-text breakage rate; <10% = gpt-image-text, ≥10% = overlay base). This gate is build task #1 of the engine.
- **Search = live, restricted to a trusted-source whitelist, scoped to the customer's `BrandProfile.topics`. No RAG.** Every factual claim must be paired with a `SourceCitation` (URL). Never fabricate a source — if no trusted source exists, the post ships as opinion/tone with no factual claim.
- **No auto-publishing.** Human approval is mandatory before manual publish. No cookie-auth to platforms (account-ban risk) — official APIs only if/when publishing is added (V2).
- **Single ~599 SAR plan, Saudi market only, SMB only.** Individuals/agencies, analytics, automation, white-label, video, non-LinkedIn/X platforms = **out of scope (V2)**. Don't expand scope.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (React), RTL, IBM Plex Sans Arabic, mobile-first |
| Backend | NestJS 10 (Node 20+ / TypeScript) |
| DB | PostgreSQL 16 + Prisma 7 (driver-adapter via `@prisma/adapter-pg`; generated client in `src/generated/prisma/`) |
| Jobs/Queue | BullMQ + Redis 7 (ioredis) |
| Object storage | MinIO / S3-compatible |
| AI text | Claude API behind `ContentProvider` |
| AI images | OpenAI gpt-image behind `ImageProvider` (+ vision verify + overlay fallback) |
| Payments | Moyasar (mada / Apple Pay / cards) |
| Infra | Docker / Docker Compose |

## Commands (after Sprint 0 scaffolds the project)

```bash
docker compose up -d            # postgres, redis, minio (local dev)
npm run start:dev               # NestJS watch mode (routes under /api/v1)
npm run build                   # nest build
npm run lint                    # eslint
npm run typecheck               # tsc --noEmit
npm test                        # jest (all)
npm test -- platform-limits     # single test file (pass a name fragment)
npx prisma migrate dev --name <name>   # new migration (never edit an applied one)
npx prisma generate             # regenerate client after schema change
```

## Architecture — the content engine (the heart and the risk)

Read [docs/blueprint/16-معمارية-المحرّك.md](docs/blueprint/16-معمارية-المحرّك.md) before touching engine code. A hybrid pipeline where each stage is an independently-testable unit:

1. **research** `(topic, brand) → FactSet` — live search restricted to the trusted-source whitelist + `brand.topics`; extracts facts each with a `sourceUrl`. No trusted source → `hasFactualClaim=false`. The real `SearchProvider` impl **and** the `trusted-sources` whitelist (config, not hardcoded — updatable without a deploy) are **owned and built inside the engine phase**, not inherited from another team.
2. **draft** `(DraftInput) → Draft` (Claude via `ContentProvider`) — writes in brand tone, ties each factual claim to its source, respects platform limits (doc 15).
3. **critique** `(Draft, Rubric) → CritiqueResult` — self-critique against a rubric (tone / source integrity / platform compliance / prohibitions / clarity). Refine + re-score, **max 2–3 loops**, then pass the best version with surfaced `issues`. This loop is what beats raw GPT.
4. **generateImage** `(brief, kit, platform) → ImageAsset` — gpt-image + visual verify (regen 2–3×) → overlay fallback. Gated by the 20-image decision above.
5. **assemble** `(draft, image, platform) → Post` — merges into a `Post` at `draft → pending_review`.

**Month plan** = a BullMQ job distributing N posts over the Saudi calendar with a progress indicator; one post failing doesn't drop the plan. **Critical distinction:** `skipped_quota` (usage cap hit mid-plan — mark, notify, continue, **no retry**) ≠ `provider_error` (operational failure — retry + record in `UsageRecord`). Conflating them causes pointless retries on over-quota posts.

## Engine seams (single source of truth: doc 16, mirrored in code)

`ContentProvider`, `ImageProvider`, `SearchProvider` are the only allowed entry points to AI/search. Type names and signatures in `src/engine/` must match doc 16 exactly. Post lifecycle states are exactly `draft → pending_review → approved → published`. Platform limits (LinkedIn 3000 chars / 3–5 hashtags; X 280 free / 25000 premium / 1–2 hashtags; X weighted count via `twitter-text`) live in **one** config module (`src/config/platform-limits.ts`), never scattered.

## Hard rules

- **Code is English-only** — identifiers, comments, commit messages, log strings. Arabic only in user-facing content/strings and explicitly-requested docs. (Blueprint/specs are intentionally Arabic prose.)
- **Every AI call records a `UsageRecord`** (text/image/search) for margin tracking; enforce per-tenant usage caps.
- **Never edit an applied Prisma migration** — always add a new one. Phase-local tables (`SaudiOccasion`, `Reminder`, `Invoice`) come with their own phase migration.
- **Tenant isolation** on every query; encrypt secrets; PDPL (explicit consent, data minimization, delete/export) + simple subscription invoices. Note: gpt-image means a *second* external data flow (OpenAI alongside Claude) — both must be covered in the privacy disclosure.
- **TDD:** failing test first → minimal impl → commit per task. CI runs lint + typecheck + test on every PR.

## Build flow

Phased plan-of-plans ([docs/blueprint/17-خطة-المشروع.md](docs/blueprint/17-خطة-المشروع.md)). Each phase is delivered as **working, independently-tested software** via its own `spec → plan → build` cycle using the superpowers skills — don't write future phases' plans ahead of time. Build order: **0 → 1 → 2 → 3 → 4 → 5 → 6**, frontend (7, Ali) parallel behind API contracts. Engine (phase 1) comes first because it's the heart and the risk.

- Phase 0 — Foundation: plan ready at [docs/plans/2026-06-29-foundation-sprint0.md](docs/plans/2026-06-29-foundation-sprint0.md). Execute it with `superpowers:subagent-driven-development` or `executing-plans`.
- Phases 2–7 specs: [docs/specs/](docs/specs/). Phase 1 (engine) spec: doc 16.
- Team split: backend/engine = Tariq, frontend = Ali; clean API contract between them.

## Useful skills for this repo

- `moyasar` — before building any Moyasar payment/subscription/webhook flow (phase 6).
- `superpowers:brainstorming` / `writing-plans` / `subagent-driven-development` / `test-driven-development` / `systematic-debugging` — the per-phase workflow.
- `frontend-engineer`, `frontend-design` — Next.js RTL UI (phase 7).
- `pr-review-expert`, `/code-review` — before merging.

**Quality is the product.** The differentiator over $10 tools is Arabic quality: tone match, real sourced facts, and clean Arabic-on-image. Periodic human eval of Arabic output is part of the definition of done — don't ship engine output that hasn't been judged against the rubric.

## Coding rules (enforced by lint + CI)

These rules are not aspirational — they are checked by `npm run verify` (lint + typecheck + format + tests) on every CI run. Don't ship code that breaks them.

### Engine seam (architectural)

- **AI/search SDKs live ONLY in `src/engine/providers/**`.** Imports of `@anthropic-ai/sdk` and `openai` are blocked everywhere else by ESLint (`no-restricted-imports`). Depend on `ContentProvider` / `ImageProvider` / `SearchProvider` seams from services.
- **Platform limits live in `src/config/platform-limits.ts`** — never hardcode LinkedIn 3000 / X 280 in a service.
- **Post lifecycle is exactly `draft → pending_review → approved → published`.** Transitions go through `PostStateMachine`, not ad-hoc string writes.
- **Every domain row carries `tenantId`.** Every query filters on it. No global reads.

### Type safety

- **No `any` in production code.** Tests (`*.spec.ts`) may use it. Prisma JSON columns use `Prisma.InputJsonValue`; Prisma row mappers use `Prisma.XGetPayload<{ include: ... }>` so the row type matches the query.
- **`prefer-const`, `no-var`, `eqeqeq`** — enforced.
- **`unknown` over `any`** at boundaries (`catch (err: unknown)`, `req: { ... }`). Narrow before use.

### Style

- **Prettier** is the formatter — no manual formatting debates. Run `npm run format` before committing; CI runs `npm run format:check`.
- **English-only** in identifiers, comments, log strings, commit messages. Arabic in user-facing copy + explicitly-requested docs only.

### Before opening a PR

Run `npm run verify`. It runs lint + typecheck + format-check + tests. CI will reject the PR otherwise.
