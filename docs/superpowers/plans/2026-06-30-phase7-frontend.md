# Phase 7 — Frontend (Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js 15 frontend for أثر (Athar) — a 3-milestone V1 covering Auth, Onboarding, Posts, and Single-Post Generation, with month-plan as a small follow-on (M2.1).

**Architecture:** Three milestones on separate branches (LR-008). M1 = foundations (Next.js, design tokens, Auth via cookie, AppShell, empty Dashboard). M2 = real MVP (Onboarding wizard, Posts list/editor, single-post Generate). M2.1 = Month-plan polling on top of M2. V1.1 (Calendar + Publish) and V1.2 (Billing + Settings) are out-of-scope for this plan and get their own plans later.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · TanStack Query 5 · lucide-react · CSS Modules + tokens.css (OKLCH) · Vitest + RTL + MSW · Playwright + axe-core · Stylelint · next/font/local.

---

## Global Constraints

- **Code is English-only.** Identifiers, comments, commit messages, log strings, JSX. Arabic only in `i18n/ar.json` and `aria-label` strings.
- **TDD discipline (LR-005).** Failing test → minimal impl → commit per task.
- **Frequent commits.** One commit per task (TDD micro-cycle).
- **Branch isolation (LR-008).** Each milestone on its own `tariq/<date>-<slug>` branch. `branch-guard.sh` enforces.
- **Backend dependencies** are blocking: `auth-session-hardening` before M1; `engine-http-surface` (with async-ready generate) before M2.
- **Auth: cookie httpOnly only.** `credentials: 'include'` on every fetch. CSRF token on mutations (double-submit cookie + Origin validation — backend).
- **WCAG 2.1 AA baseline + AAA selective** (post body, billing, StatusBadge, errors).
- **No raw colors.** All colors via OKLCH tokens in `styles/tokens.css`.
- **Icons: `lucide-react` only.** `strokeWidth: 1.5`. Sizes 16/20/24.
- **No local Button/Input/Modal/Toast/EmptyState/ErrorState/Skeleton in pages** — only via `components/ui/` or `components/shared/`.
- **TanStack Query is the only data layer.** No `services/` directory. Mutations invalidate cache keys.

---

## Pre-Flight Findings

Verified against `main` at SHA `093a082` on 2026-06-30 (pre-Sprint-A-specs).

| Assumption | Reality on `main` | Resolution |
|---|---|---|
| `app/(auth)/login` etc. don't exist | Confirmed — no frontend code exists | Create from scratch in M1 |
| No `GET /auth/me` endpoint | Confirmed (Sprint A adds it via `auth-session-hardening` package) | Block M1 on `auth-session-hardening` delivery |
| No `EngineController` | Confirmed — `PipelineService` is internal | Block M2 on `engine-http-surface` delivery |
| No `GET /content/jobs/:jobId` | Confirmed — `MonthPlanService` is internal | `engine-http-surface` delivers a unified `/content/jobs/:jobId` used by both generate and month-plan |
| `PostPlatform = 'linkedin' \| 'x'` (from `src/posts/post.types.ts:5`) | Confirmed | Use as `Platform` type in frontend |
| `PostStatus` from Prisma enum | Confirmed | Map `PostStatus → StatusBadgeKind` in a single converter |
| `PostListItem`, `PostDetail`, `PostCitation`, `PostImage` shapes exist | Confirmed at `src/posts/post.types.ts` | Copy types into `types/` directory and reference |
| `BrandAnalysisResult`, `ConfirmationQuestion`, `BrandKitDraftDto` exist | Confirmed at `src/brand/types.ts` and `src/brand/dto` | Copy into `types/` |
| `CalendarEntry` from `src/calendar/calendar.types.ts` | Confirmed | Reference in types/ (V1.1, not in this plan) |
| Fonts source on disk: `/Users/tariq/Desktop/خط عام الحرف اليدوية 2025/TTF/` and `/Users/tariq/Downloads/Munasabat-00016 2/خط افرا/` | Confirmed in M1 setup task | One-time copy to `app/fonts/`; licensing TODO before production |
| No existing tests for frontend | Confirmed | Set up Vitest + RTL + Playwright + MSW from scratch |
| No existing ESLint config | Confirmed | Bootstrap from scratch in M1 |

---

## File Structure (created across M1, M2, M2.1)

```
athar-web/                                  # new Next.js app at repo root
  app/
    layout.tsx                              # dir=rtl, lang=ar, font loading
    (auth)/
      login/page.tsx                        # M1
      register/page.tsx                     # M1
    (app)/
      layout.tsx                            # M1 — Route UX guard + AppShell
      dashboard/page.tsx                    # M1 shell, M2 enhanced
      onboarding/page.tsx                   # M2
      posts/page.tsx                        # M2
      posts/[postId]/page.tsx               # M2
      generate/page.tsx                     # M2 (single), M2.1 (+ month)
    fonts/
      handicrafts/                          # M1
      plex-arabic/                          # M1
      effra/                                # M1
  components/
    ui/
      Button/Button.tsx + Button.module.css          # M1
      IconButton/IconButton.tsx                       # M1
      Input/Input.tsx                                 # M1
      Textarea/Textarea.tsx                           # M2 (onboarding)
      Select/Select.tsx                               # M2 (onboarding)
      FormField/FormField.tsx                         # M1
      Modal/Modal.tsx                                 # M2 (confirmations)
      Spinner/Spinner.tsx                             # M1
      Divider/Divider.tsx                             # M2
      Tabs/Tabs.tsx                                   # M2 (posts filter)
    shared/
      StatusBadge/StatusBadge.tsx                     # M1
      EmptyState/EmptyState.tsx                       # M1
      ErrorState/ErrorState.tsx                       # M1
      Skeleton/Skeleton.tsx                           # M1
      Toast/Toast.tsx + ToastProvider.tsx             # M1
      PageHeader/PageHeader.tsx                       # M2
      PlatformBadge/PlatformBadge.tsx                 # M2
      FilterBar/FilterBar.tsx                         # M2
      PostCard/PostCard.tsx                           # M2
      SourceList/SourceList.tsx                       # M2
      ImagePreview/ImagePreview.tsx                   # M2
      CharCounter/CharCounter.tsx                     # M2
    layout/
      AppShell/AppShell.tsx                           # M1
      Header/Header.tsx                               # M1
      BottomNav/BottomNav.tsx                         # M1
      SideNav/SideNav.tsx                             # M1
      PageContainer/PageContainer.tsx                 # M1
    providers/
      SessionProvider.tsx                             # M1
      ToastProvider.tsx                               # M1
      LocaleProvider.tsx                              # M1 (no LocaleSwitch in V1, just the provider)
  queries/
    useAuth.ts                                        # M1
    useMe.ts                                          # M1
    useBrandProfile.ts                                # M2
    useBrandAnalysis.ts                               # M2
    useCreateProfile.ts                               # M2
    usePosts.ts                                       # M2
    usePost.ts                                        # M2
    useUpdatePost.ts                                  # M2
    useGenerate.ts                                    # M2
    useApprovePost.ts                                 # M2
    useStartMonthPlan.ts                              # M2.1
    useMonthPlan.ts                                   # M2.1 (polling)
  lib/
    apiClient.ts                                      # M1
    queryClient.ts                                    # M1
    formatNumber.ts                                   # M1
    csrf.ts                                           # M1 (read X-CSRF-Token cookie)
    twitterText.ts                                    # M2 (wrapper around twitter-text)
  i18n/
    ar.json                                           # M1
  types/
    api.ts                                            # M1 (ApiError, etc.)
    auth.ts                                           # M1 (SessionUser)
    brand.ts                                          # M2 (BrandAnalysisResult, etc.)
    post.ts                                           # M2 (PostListItem, PostDetail, etc.)
  styles/
    tokens.css                                        # M1 (OKLCH tokens)
    globals.css                                       # M1
    fonts.css                                         # M1
  middleware.ts                                       # M1 (Route UX guard)
  test/
    setup.ts                                          # M1 (vitest + RTL + MSW)
    setup-e2e.ts                                      # M1 (playwright)
  e2e/
    auth.spec.ts                                      # M1
    m2-journey.spec.ts                                # M2
    m21-month-plan.spec.ts                            # M2.1
  vitest.config.ts                                    # M1
  playwright.config.ts                                # M1
  stylelint.config.js                                 # M1
  eslint.config.js                                    # M1
  package.json                                       # M1
  tsconfig.json                                      # M1
  next.config.ts                                     # M1
```

Each milestone is a single PR with all files for that milestone. M1 PR is reviewable on its own (login + register + dashboard shell + design system). M2 PR is reviewable once backend `engine-http-surface` is merged. M2.1 PR is reviewable once month-plan backend is merged.

---

## M1 — Foundations (Auth, AppShell, empty Dashboard)

> **Branch:** `tariq/2026-06-30-phase7-m1-foundations`
> **Blocker:** `auth-session-hardening` backend PR must be merged to main first (delivers `GET /auth/me`, cookie session middleware, CSRF, Origin validation).
> **Exit criterion:** `npm run dev` shows `/login`, `/register`, and a stub `/dashboard` (cream canvas, primary-deep heading, no data). Vitest + RTL + Playwright run green.

### Task 1.1: Bootstrap Next.js app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`

**Step 1:** Init project files

```bash
cd /Users/tariq/code/أثر
git switch -c tariq/2026-06-30-phase7-m1-foundations
mkdir -p app components lib queries styles types i18n test e2e public
```

**Step 2:** Write `package.json`

```json
{
  "name": "athar-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . && stylelint '**/*.css'",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:install": "playwright install --with-deps chromium"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.59.0",
    "lucide-react": "^0.460.0",
    "zod": "^3.23.8",
    "twitter-text": "^3.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0",
    "@types/twitter-text": "^3.1.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "stylelint": "^16.0.0",
    "stylelint-config-standard": "^36.0.0",
    "vitest": "^2.0.0",
    "@vitest/ui": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^25.0.0",
    "msw": "^2.6.0",
    "@playwright/test": "^1.48.0"
  }
}
```

**Step 3:** Write `tsconfig.json` (strict, Next.js preset)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4:** Write `next.config.ts`

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  // Frontend served at /api proxy or same-origin; API_BASE env-driven.
  env: { NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1' },
}

export default config
```

**Step 5:** Install and commit

```bash
npm install
git add package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts
git commit -m "chore(web): bootstrap Next.js 15 + React 19 + TS strict"
```

### Task 1.2: Copy fonts to `app/fonts/`

**Files:**
- Create: `app/fonts/handicrafts/*.ttf`, `app/fonts/effra/*.otf` (binary, copied from desktop)
- Create: `app/fonts/plex-arabic/` (downloaded IBM Plex Sans Arabic; or use next/font/google for now)

**Step 1:** Copy display + Latin fonts

```bash
cp /Users/tariq/Desktop/خط\ عام\ الحرف\ اليدوية\ 2025/TTF/*.ttf app/fonts/handicrafts/
cp /Users/tariq/Downloads/Munasabat-00016\ 2/خط\ افرا/*.otf app/fonts/effra/
```

**Step 2:** Add a LICENSING.md at the repo root

```markdown
# Font Licensing — TODO BEFORE PRODUCTION

- TheYearofHandicrafts (display Arabic): source unclear. **DO NOT** ship to production until license confirmed.
- Effra (Latin): check commercial-use license with foundry before production.
- IBM Plex Sans Arabic: SIL Open Font License (allowed).
```

**Step 3:** Commit (do NOT include binaries that may exceed git-lfs limits without setup)

```bash
git add app/fonts/ LICENSING.md
git commit -m "chore(fonts): copy display + Latin fonts into app/fonts (licensing TODO)"
```

### Task 1.3: Design tokens (`styles/tokens.css`)

**Files:**
- Create: `styles/tokens.css`

**Step 1:** Write tokens.css with all OKLCH variables from `.impeccable.md`

```css
:root {
  /* Colors — OKLCH perceptual */
  --color-primary-deep: oklch(28% 0.03 165);    /* #0F2E2A — أخضر داكن */
  --color-primary:      oklch(48% 0.10 155);    /* #2E7D59 — أخضر رئيسي */
  --color-surface:      oklch(94% 0.025 85);    /* #F2E8D5 — بيج/cream */
  --color-accent:       oklch(72% 0.075 70);    /* #D4A373 — ذهبي ترابي */
  --color-border:       oklch(92% 0.005 250);   /* #E6E8EB */
  --color-heading:      oklch(28% 0.04 250);    /* #1E293B — كحلي */
  --color-mint:         oklch(95% 0.025 155);   /* #E6F3EC */
  --color-sage:         oklch(75% 0.05 155);    /* #A7C7B7 */
  --color-muted:        oklch(50% 0.02 60);     /* #7A6F64 */
  --color-elevated:     oklch(100% 0 0);        /* #FFFFFF — modals only */
  --color-text:         var(--color-primary-deep);
  --color-text-on-primary: var(--color-elevated);
  --color-text-muted:   var(--color-muted);

  /* Status colors — green/terracotta/navy-tinted */
  --color-success:      var(--color-primary);
  --color-warning:      var(--color-accent);
  --color-error:        oklch(50% 0.15 25);      /* terracotta-tinted, AAA on cream */

  /* Typography */
  --font-display: 'TheYearofHandicrafts', 'IBM Plex Sans Arabic', serif;
  --font-body:    'IBM Plex Sans Arabic', system-ui, sans-serif;
  --font-latin:   'Effra', system-ui, sans-serif;

  --text-display:  2.5rem;        /* 40px */
  --text-h2:       2rem;          /* 32px */
  --text-h3:       1.5rem;        /* 24px */
  --text-body-lg:  1.125rem;      /* 18px */
  --text-body:     1rem;          /* 16px */
  --text-sm:       0.875rem;      /* 14px */
  --text-xs:       0.75rem;       /* 12px */

  /* Spacing — 4pt scale */
  --space-xs:   4px;
  --space-sm:   8px;
  --space-md:   12px;
  --space-base: 16px;
  --space-lg:   24px;
  --space-xl:   32px;
  --space-2xl:  48px;
  --space-3xl:  64px;
  --space-4xl:  96px;

  /* Motion */
  --motion-instant:      80ms;
  --motion-quick:        160ms;
  --motion-base:         240ms;
  --motion-slow:         400ms;
  --motion-orchestrated: 600ms;
  --easing-expo:         cubic-bezier(0.16, 1, 0.3, 1);

  /* Borders / focus */
  --border-hairline: 1px;
  --focus-ring: 2px solid var(--color-primary);
  --focus-offset: 2px;

  /* Layout */
  --container-max: 1200px;
  --touch-target:  44px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    transform: none !important;
  }
}
```

**Step 2:** Commit

```bash
git add styles/tokens.css
git commit -m "feat(web): design tokens (OKLCH) + reduced-motion support"
```

### Task 1.4: Global styles + fonts.css

**Files:**
- Create: `styles/globals.css`, `styles/fonts.css`

**Step 1:** Write `styles/fonts.css`

```css
/* Display: TheYearofHandicrafts */
@font-face {
  font-family: 'TheYearofHandicrafts';
  src: url('/_next/static/media/handicrafts/TheYearofHandicraftsTTF-Reg.ttf') format('truetype');
  font-weight: 400;
  font-display: swap;
}
/* …repeat for Med (500), SemiBold (600), Bold (700), Black (900) — wired via next/font/local in app/layout.tsx */

/* Latin: Effra */
@font-face {
  font-family: 'Effra';
  src: url('/_next/static/media/effra/Effra-Regular.otf') format('opentype');
  font-weight: 400;
  font-display: swap;
}
/* …repeat for Med, SemiBold, Bold */
```

**Note:** `next/font/local` generates the actual `@font-face` declarations automatically when configured in `app/layout.tsx`. This CSS file is a fallback. Most usage: configure fonts via `next/font/local` (Task 1.6).

**Step 2:** Write `styles/globals.css`

```css
@import './tokens.css';
@import './fonts.css';

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: 'tnum' on, 'kern' on;
}

h1, h2, h3, h4 { font-family: var(--font-display); color: var(--color-primary-deep); margin: 0; }
h1 { font-size: var(--text-display); line-height: 1.15; letter-spacing: -0.01em; }
h2 { font-size: var(--text-h2); line-height: 1.2; }
h3 { font-size: var(--text-h3); line-height: 1.3; }

a { color: var(--color-primary); text-decoration: underline; text-underline-offset: 2px; }
a:hover { color: var(--color-primary-deep); }

button { font-family: inherit; cursor: pointer; }

/* Focus rings — WCAG 2.1 AA */
:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

/* RTL specifics */
html[dir='rtl'] body { text-align: right; }
```

**Step 3:** Commit

```bash
git add styles/globals.css styles/fonts.css
git commit -m "feat(web): globals.css + focus rings + RTL base"
```

### Task 1.5: ESLint + Stylelint configs

**Files:**
- Create: `eslint.config.js`, `stylelint.config.js`

**Step 1:** `eslint.config.js` (Next.js flat config + custom rules)

```js
import next from 'eslint-config-next'

export default [
  ...next,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'No direct fetch from components. Use apiClient from lib/apiClient.ts.',
        },
      ],
    },
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
]
```

**Step 2:** `stylelint.config.js` (binding rules from `.impeccable.md`)

```js
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    // Allow 1px, 2px, 44px, breakpoint values; ban raw pixel values otherwise
    'declaration-property-value-disallowed-list': {
      '/.*/': [
        /(?<!\d)(?<!\b1)(?<!\b2)(?<!\b44)(?<!\b768)(?<!\b1024)(?<!\b1280)(?<!\b1440)\d+px(?!.*media)/,
        {
          message: 'Use a spacing/breakpoint token or one of the allowed values (1px, 2px, 44px, or media query breakpoints).',
        },
      ],
    },
    // Side-stripe borders banned (per .impeccable.md AI-slop test)
    'declaration-property-value-disallowed-list': {
      'border-left-width': [/^(?:[3-9]|[1-9]\d|\d{3,})px$/],
      'border-right-width': [/^(?:[3-9]|[1-9]\d|\d{3,})px$/],
    },
  },
  overrides: [
    {
      // Tokens.css is allowed to use raw values (it IS the token source)
      files: ['styles/tokens.css', 'styles/globals.css'],
      rules: { 'declaration-property-value-disallowed-list': null, 'color-no-hex': null },
    },
  ],
}
```

**Step 3:** Verify both run

```bash
npm run lint
```

Expected: 0 errors.

**Step 4:** Commit

```bash
git add eslint.config.js stylelint.config.js
git commit -m "feat(web): eslint + stylelint configs (no-fetch, no-hex, no-side-stripe)"
```

### Task 1.6: Root layout with fonts + RTL

**Files:**
- Create: `app/layout.tsx`

**Step 1:** Write layout

```tsx
import localFont from 'next/font/local'
import './../styles/globals.css'

const handicrafts = localFont({
  src: [
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Reg.ttf', weight: '400' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Med.ttf', weight: '500' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-SemBd.ttf', weight: '600' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Bold.ttf', weight: '700' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Black.ttf', weight: '900' },
  ],
  variable: '--font-handicrafts',
  display: 'swap',
})

const plexArabic = localFont({
  src: './fonts/plex-arabic/IBMPlexSansArabic-Regular.woff2',
  weight: '400',
  variable: '--font-plex-arabic',
  display: 'swap',
})

const effra = localFont({
  src: [
    { path: './fonts/effra/Effra-Regular.otf', weight: '400' },
    { path: './fonts/effra/Effra-Medium.otf', weight: '500' },
    { path: './fonts/effra/Effra-SemiBold.otf', weight: '600' },
    { path: './fonts/effra/Effra-Bold.otf', weight: '700' },
  ],
  variable: '--font-effra',
  display: 'swap',
})

export const metadata = {
  title: 'أثر',
  description: 'من المعرفة إلى الأثر',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${handicrafts.variable} ${plexArabic.variable} ${effra.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

**Step 2:** Update `styles/tokens.css` to use the next/font variables

Replace `--font-display: 'TheYearofHandicrafts', …` with `--font-display: var(--font-handicrafts), …` etc.

**Step 3:** Run typecheck

```bash
npm run typecheck
```

Expected: 0 errors.

**Step 4:** Commit

```bash
git add app/layout.tsx styles/tokens.css
git commit -m "feat(web): root layout — RTL, lang=ar, next/font/local for all three fonts"
```

### Task 1.7: apiClient + UnauthorizedError

**Files:**
- Create: `lib/apiClient.ts`, `lib/csrf.ts`
- Create: `types/api.ts`

**Step 1:** Write `types/api.ts`

```ts
export type ApiError = { code: string; messageAr: string; status: number; fields?: Record<string, string> }

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED' as const
  constructor() { super('unauthorized') }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const
  constructor() { super('forbidden') }
}
```

**Step 2:** Write `lib/csrf.ts`

```ts
export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}
```

**Step 3:** Failing test for apiClient (`test/apiClient.spec.ts`)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient, UnauthorizedError } from '@/lib/apiClient'

describe('apiClient', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('throws UnauthorizedError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(apiClient.get('/auth/me')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('sends credentials: include', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiClient.get('/auth/me')
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: 'include' }))
  })

  it('attaches X-CSRF-Token header on POST when csrf cookie present', async () => {
    document.cookie = 'csrf=token-abc'
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiClient.post('/auth/login', { email: 'a@b.com', password: 'x' })
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers['X-CSRF-Token']).toBe('token-abc')
  })

  it('parses ApiError envelope on non-401 non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'INVALID_INPUT', messageAr: 'خطأ' }), { status: 422, headers: { 'Content-Type': 'application/json' } }
    )))
    await expect(apiClient.get('/brand/profile')).rejects.toMatchObject({ status: 422, code: 'INVALID_INPUT' })
  })
})
```

**Step 4:** Write `lib/apiClient.ts`

```ts
import { readCsrfCookie } from './csrf'
import { UnauthorizedError, ForbiddenError, type ApiError } from '@/types/api'

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (method !== 'GET') {
    const csrf = readCsrfCookie()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new ForbiddenError()
  if (!res.ok) {
    const envelope = await res.json().catch(() => ({}))
    const err: ApiError = { status: res.status, code: envelope.code ?? 'UNKNOWN', messageAr: envelope.messageAr ?? 'حدث خطأ' }
    throw err
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  get:   <T>(p: string) => request<T>('GET', p),
  post:  <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  delete:<T>(p: string) => request<T>('DELETE', p),
}
```

**Step 5:** Run tests

```bash
npm test -- apiClient
```

Expected: PASS.

**Step 6:** Commit

```bash
git add lib/apiClient.ts lib/csrf.ts types/api.ts test/apiClient.spec.ts
git commit -m "feat(web): apiClient (cookie + CSRF + UnauthorizedError)"
```

### Task 1.8: SessionProvider (catches UnauthorizedError, redirects)

**Files:**
- Create: `components/providers/SessionProvider.tsx`
- Create: `test/SessionProvider.spec.tsx`

**Step 1:** Failing test

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { apiClient } from '@/lib/apiClient'

vi.mock('@/lib/apiClient')
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('SessionProvider', () => {
  it('redirects to /login?returnTo=… on UnauthorizedError', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const replace = vi.fn()
    vi.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({ push: replace, replace: vi.fn() })
    // Trigger an UnauthorizedError via a button
    ;(apiClient.get as any).mockRejectedValue(new (require('@/types/api').UnauthorizedError)())
    render(
      <QueryClientProvider client={qc}>
        <SessionProvider>
          <button onClick={() => apiClient.get('/auth/me').catch(() => {})}>trigger</button>
        </SessionProvider>
      </QueryClientProvider>
    )
    userEvent.click(screen.getByText('trigger'))
    await waitFor(() => expect(qc.getQueryCache().getAll()).toEqual([]))
  })
})
```

**Step 2:** Implementation

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const qc = useQueryClient()

  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      if (reason?.code === 'UNAUTHORIZED') {
        qc.clear()
        const returnTo = encodeURIComponent(pathname ?? '/dashboard')
        router.push(`/login?returnTo=${returnTo}`)
      }
    }
    window.addEventListener('unhandledrejection', onError)
    return () => window.removeEventListener('unhandledrejection', onError)
  }, [router, qc, pathname])

  return <>{children}</>
}
```

**Step 3:** Run test

```bash
npm test -- SessionProvider
```

Expected: PASS (after fixture tweaks).

**Step 4:** Commit

```bash
git add components/providers/SessionProvider.tsx test/SessionProvider.spec.tsx
git commit -m "feat(web): SessionProvider catches UnauthorizedError, clears cache, redirects to /login"
```

### Task 1.9: TanStack Query setup (queryClient + LocaleProvider)

**Files:**
- Create: `lib/queryClient.ts`, `components/providers/LocaleProvider.tsx`, `i18n/ar.json`

**Step 1:** `lib/queryClient.ts`

```ts
import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error: any) => {
          if (error?.code === 'UNAUTHORIZED' || error?.code === 'FORBIDDEN') return false
          return failureCount < 2
        },
      },
    },
  })
}
```

**Step 2:** `i18n/ar.json`

```json
{
  "auth.login.title": "أهلاً بعودتك",
  "auth.login.email": "البريد الإلكتروني",
  "auth.login.password": "كلمة المرور",
  "auth.login.submit": "دخول",
  "auth.login.noAccount": "ما عندك حساب؟",
  "auth.login.signup": "سجّل",
  "auth.register.title": "ابدأ مع أثر",
  "auth.register.email": "البريد الإلكتروني",
  "auth.register.password": "كلمة المرور",
  "auth.register.name": "اسمك",
  "auth.register.tenantName": "اسم شركتك",
  "auth.register.acceptTerms": "أوافق على الشروط",
  "auth.register.submit": "إنشاء الحساب",
  "auth.register.hasAccount": "عندك حساب؟",
  "auth.register.signin": "دخول",
  "dashboard.greeting": "أهلاً، {name}",
  "dashboard.emptyPosts": "ما عندك بوستات بعد.",
  "dashboard.startOnboarding": "أكمل دماغ الشركة",
  "common.retry": "أعد المحاولة",
  "common.loading": "يحمل…",
  "common.error": "حدث خطأ"
}
```

**Step 3:** `components/providers/LocaleProvider.tsx` (no LocaleSwitch in V1, just provider stub for future i18n)

```tsx
'use client'
import { createContext, useContext } from 'react'
import ar from '@/i18n/ar.json'

const dict = ar as Record<string, string>
type Dict = typeof dict

const I18nContext = createContext<{ t: (k: keyof Dict, vars?: Record<string, string>) => string }>({
  t: (k, vars) => {
    let s = dict[k] ?? String(k)
    if (vars) for (const [k2, v] of Object.entries(vars)) s = s.replace(`{${k2}}`, v)
    return s
  },
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  return <I18nContext.Provider value={{ t: (k, vars) => {
    let s = dict[k as string] ?? String(k)
    if (vars) for (const [k2, v] of Object.entries(vars)) s = s.replace(`{${k2}}`, v)
    return s
  } }}>{children}</I18nContext.Provider>
}

export const useT = () => useContext(I18nContext).t
```

**Step 4:** Update `app/layout.tsx` to wrap children in providers (use `<SessionProvider>` + `<LocaleProvider>` + `<QueryClientProvider>`)

**Step 5:** Commit

```bash
git add lib/queryClient.ts components/providers/LocaleProvider.tsx i18n/ar.json app/layout.tsx
git commit -m "feat(web): TanStack Query setup + LocaleProvider + i18n/ar.json"
```

### Task 1.10: ui components — Button, IconButton, FormField, Input, Spinner

**Files:**
- Create: `components/ui/Button/Button.tsx`, `Button.module.css`
- Create: `components/ui/IconButton/IconButton.tsx`
- Create: `components/ui/Input/Input.tsx`
- Create: `components/ui/FormField/FormField.tsx`
- Create: `components/ui/Spinner/Spinner.tsx`
- Create: `test/Button.spec.tsx`

**Step 1:** Failing test for Button

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button/Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>دخول</Button>)
    expect(screen.getByRole('button', { name: 'دخول' })).toBeInTheDocument()
  })
  it('is disabled when loading', () => {
    render(<Button loading>دخول</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
  it('fires onClick when not disabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>دخول</Button>)
    userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})
```

**Step 2:** Write `components/ui/Button/Button.tsx` + `Button.module.css`

```tsx
import styles from './Button.module.css'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, iconStart, iconEnd, type = 'button', onClick, children }: ButtonProps) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${styles[variant]} ${styles[size]}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      {loading ? <Loader2 className={styles.spinner} size={20} aria-hidden="true" /> : iconStart}
      <span>{children}</span>
      {iconEnd}
    </button>
  )
}
```

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-family: var(--font-body);
  font-weight: 500;
  border: none;
  border-radius: 0; /* sharp rectangles, premium */
  transition: background var(--motion-quick) var(--easing-expo);
  cursor: pointer;
}

.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sm { padding: var(--space-sm) var(--space-base); font-size: var(--text-sm); min-height: 36px; }
.md { padding: var(--space-md) var(--space-lg); font-size: var(--text-body); min-height: var(--touch-target); }
.lg { padding: var(--space-base) var(--space-xl); font-size: var(--text-body-lg); min-height: 52px; }

.primary { background: var(--color-primary-deep); color: var(--color-text-on-primary); }
.primary:hover:not(:disabled) { background: var(--color-heading); }

.secondary { background: var(--color-surface); color: var(--color-primary-deep); border: var(--border-hairline) solid var(--color-border); }
.secondary:hover:not(:disabled) { background: var(--color-mint); }

.tertiary { background: transparent; color: var(--color-primary); }
.tertiary:hover:not(:disabled) { color: var(--color-primary-deep); }

.danger { background: var(--color-error); color: var(--color-text-on-primary); }

.spinner { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

**Step 3:** IconButton, Input, FormField, Spinner — analogous tests + impls (omit verbatim code; mirror Button pattern)

**Step 4:** Run tests

```bash
npm test -- Button
```

Expected: PASS.

**Step 5:** Commit

```bash
git add components/ui/ test/
git commit -m "feat(ui): Button + IconButton + Input + FormField + Spinner"
```

### Task 1.11: shared components — StatusBadge, EmptyState, ErrorState, Skeleton, Toast

**Files:**
- Create: `components/shared/StatusBadge/StatusBadge.tsx`
- Create: `components/shared/EmptyState/EmptyState.tsx`
- Create: `components/shared/ErrorState/ErrorState.tsx`
- Create: `components/shared/Skeleton/Skeleton.tsx`
- Create: `components/shared/Toast/Toast.tsx` + `ToastProvider.tsx`
- Create: `test/StatusBadge.spec.tsx`

**Step 1:** Failing test for StatusBadge

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/shared/StatusBadge/StatusBadge'

describe('StatusBadge', () => {
  it('renders Arabic label for draft', () => {
    render(<StatusBadge status="draft" />)
    expect(screen.getByText('مسوّدة')).toBeInTheDocument()
  })
  it('renders Arabic label for scheduled (derived)', () => {
    render(<StatusBadge status="scheduled" />)
    expect(screen.getByText('مجدول')).toBeInTheDocument()
  })
})
```

**Step 2:** Implementation

```tsx
import styles from './StatusBadge.module.css'

export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'published'
export type StatusBadgeKind = PostStatus | 'scheduled' | 'failed'

const AR: Record<StatusBadgeKind, string> = {
  draft: 'مسوّدة',
  pending_review: 'بانتظار المراجعة',
  approved: 'معتمدة',
  published: 'منشورة',
  scheduled: 'مجدول',
  failed: 'فشل',
}

export interface StatusBadgeProps { status: StatusBadgeKind; size?: 'sm' | 'md' }

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[status]} ${styles[size]}`}
      role="status"
      aria-label={AR[status]}
    >
      <span aria-hidden="true" className={styles.dot} />
      <span>{AR[status]}</span>
    </span>
  )
}
```

**Step 3:** EmptyState, ErrorState, Skeleton, Toast — analogous tests + impls

**Step 4:** Run tests

```bash
npm test -- shared
```

Expected: PASS.

**Step 5:** Commit

```bash
git add components/shared/ test/shared/
git commit -m "feat(shared): StatusBadge + EmptyState + ErrorState + Skeleton + Toast"
```

### Task 1.12: layout components — AppShell, Header, BottomNav, SideNav, PageContainer

**Files:**
- Create: `components/layout/AppShell/AppShell.tsx`
- Create: `components/layout/Header/Header.tsx`
- Create: `components/layout/BottomNav/BottomNav.tsx`
- Create: `components/layout/SideNav/SideNav.tsx`
- Create: `components/layout/PageContainer/PageContainer.tsx`

**Step 1:** AppShell layout

```tsx
'use client'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { BottomNav } from '../BottomNav/BottomNav'
import { SideNav } from '../SideNav/SideNav'
import { Header } from '../Header/Header'

export function AppShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  return (
    <div className="shell">
      <Header />
      <div className="shell-body">
        {isDesktop && <SideNav />}
        <main id="main" className="shell-main">{children}</main>
      </div>
      {!isDesktop && <BottomNav />}
    </div>
  )
}
```

**Step 2:** PageContainer constrains content

```tsx
export function PageContainer({ children, maxWidth = 'lg' }: { children: React.ReactNode; maxWidth?: 'md' | 'lg' }) {
  return <div className={`container container-${maxWidth}`}>{children}</div>
}
```

**Step 3:** Header, BottomNav, SideNav — implementation with lucide-react icons + tokens (omit verbatim)

**Step 4:** Tests

```bash
npm test -- layout
```

**Step 5:** Commit

```bash
git add components/layout/
git commit -m "feat(layout): AppShell + Header + BottomNav + SideNav + PageContainer"
```

### Task 1.13: useAuth + useMe hooks + types

**Files:**
- Create: `queries/useAuth.ts`, `queries/useMe.ts`
- Create: `types/auth.ts`

**Step 1:** `types/auth.ts`

```ts
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | null

export interface SessionUser {
  user: { id: string; email: string; name: string; role: UserRole }
  onboardingCompleted: boolean
  subscriptionStatus: SubscriptionStatus
  tenantId: string
}

export interface LoginInput { email: string; password: string }
export interface RegisterInput { email: string; password: string; name: string; tenantName: string; acceptTerms: true; termsVersion: string }
```

**Step 2:** `queries/useAuth.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { LoginInput, RegisterInput, SessionUser } from '@/types/auth'

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => apiClient.post<SessionUser>('/auth/login', input),
    onSuccess: (data) => qc.setQueryData(['me'], data),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) => apiClient.post<SessionUser>('/auth/register', input),
    onSuccess: (data) => qc.setQueryData(['me'], data),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<void>('/auth/logout'),
    onSuccess: () => qc.clear(),
  })
}
```

**Step 3:** `queries/useMe.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { SessionUser } from '@/types/auth'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.get<SessionUser>('/auth/me'),
    retry: false,
  })
}
```

**Step 4:** Tests for hooks (MSW mocks; omit verbatim)

**Step 5:** Commit

```bash
git add queries/useAuth.ts queries/useMe.ts types/auth.ts
git commit -m "feat(queries): useAuth (login/register/logout) + useMe"
```

### Task 1.14: Middleware (Route UX guard)

**Files:**
- Create: `middleware.ts`

**Step 1:** Implementation

```ts
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register']

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }
  const session = req.cookies.get('session') // backend-controlled cookie name
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('returnTo', pathname + search)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

**Note:** This is a UX redirect only. The actual authorization happens in NestJS guards on each endpoint.

**Step 2:** Commit

```bash
git add middleware.ts
git commit -m "feat(web): middleware — Route UX guard (redirects to /login when no session cookie)"
```

### Task 1.15: `/login` and `/register` pages

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Create: `app/(auth)/layout.tsx`

**Step 1:** `app/(auth)/layout.tsx` (minimal — no AppShell)

```tsx
import type { ReactNode } from 'react'
import styles from './layout.module.css'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}
```

**Step 2:** `app/(auth)/login/page.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useLogin } from '@/queries/useAuth'
import { Button } from '@/components/ui/Button/Button'
import { FormField } from '@/components/ui/FormField/FormField'
import { Input } from '@/components/ui/Input/Input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  const returnTo = useSearchParams().get('returnTo') ?? '/dashboard'
  const login = useLogin()
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => router.push(returnTo) })
  }
  return (
    <main className="auth-card">
      <h1>أهلاً بعودتك</h1>
      <form onSubmit={onSubmit} noValidate>
        <FormField label="البريد الإلكتروني" error={login.error?.messageAr}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!login.error} />
        </FormField>
        <FormField label="كلمة المرور">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </FormField>
        <Button type="submit" loading={login.isPending} iconStart={null}>دخول</Button>
        <p>ما عندك حساب؟ <Link href="/register">سجّل</Link></p>
      </form>
    </main>
  )
}
```

**Step 3:** `app/(auth)/register/page.tsx` — analogous

**Step 4:** Commit

```bash
git add app/\(auth\)/
git commit -m "feat(auth): /login + /register pages with FormField + Button"
```

### Task 1.16: `/dashboard` shell

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/dashboard/page.tsx`

**Step 1:** `app/(app)/layout.tsx`

```tsx
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell/AppShell'

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
```

**Step 2:** `app/(app)/dashboard/page.tsx` (M1 shell)

```tsx
'use client'
import { useMe } from '@/queries/useMe'
import { EmptyState } from '@/components/shared/EmptyState/EmptyState'
import { PageContainer } from '@/components/layout/PageContainer/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader/PageHeader'
import Link from 'next/link'

export default function DashboardPage() {
  const me = useMe()
  return (
    <PageContainer>
      <PageHeader title={`أهلاً، ${me.data?.user.name ?? '...'}`} />
      <EmptyState
        title="ما عندك بوستات بعد."
        action={<Link href="/onboarding">أكمل دماغ الشركة</Link>}
      />
    </PageContainer>
  )
}
```

**Step 3:** Commit

```bash
git add app/\(app\)/
git commit -m "feat(dashboard): empty shell wired to useMe"
```

### Task 1.17: Vitest + RTL + MSW + Playwright setup

**Files:**
- Create: `vitest.config.ts`, `test/setup.ts`, `playwright.config.ts`, `e2e/auth.spec.ts`

**Step 1:** `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    css: true,
  },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
```

**Step 2:** `test/setup.ts`

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
afterEach(() => cleanup())
```

**Step 3:** `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: !process.env.CI },
})
```

**Step 4:** `e2e/auth.spec.ts`

```ts
import { test, expect } from '@playwright/test'

test('redirects unauthenticated user from /dashboard to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?returnTo=/)
})

test('login page renders form', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'أهلاً بعودتك' })).toBeVisible()
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible()
  await expect(page.getByLabel('كلمة المرور')).toBeVisible()
})
```

**Step 5:** Run

```bash
npm test
npm run test:e2e:install
npm run test:e2e
```

Expected: PASS.

**Step 6:** Commit

```bash
git add vitest.config.ts test/ playwright.config.ts e2e/ package.json
git commit -m "test(web): vitest + RTL + MSW + Playwright setup; auth e2e"
```

### Task 1.18: M1 final — run all checks

**Step 1:** Run

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```

Expected: all green.

**Step 2:** Commit (if any drift) and merge M1 branch to main via PR.

---

## M2 — Real MVP (Onboarding, Posts, Generate single)

> **Branch:** `tariq/2026-06-30-phase7-m2-core`
> **Blocker:** `engine-http-surface` backend PR merged (delivers `POST /content/generate` async-ready + `GET /content/jobs/:jobId`).
> **Exit criterion:** Playwright journey `register → onboarding → generate (single) → edit → approve` passes; axe-core finds 0 critical violations.

### Task 2.1: Copy backend types to `types/`

**Files:**
- Create: `types/post.ts`, `types/brand.ts`

**Step 1:** `types/post.ts` — copy shapes from `src/posts/post.types.ts`

```ts
export type PostPlatform = 'linkedin' | 'x'
export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'published'

export interface PostListItem {
  id: string
  platform: PostPlatform
  status: PostStatus
  scheduledAt: string | null
  text: string
  hashtags: string[]
  hasImage: boolean
  citationCount: number
}

export interface PostImage { url: string; method: string }
export interface PostCitation { claim: string; sourceUrl: string }

export interface PostDetail {
  id: string
  tenantId: string
  brandProfileId: string
  platform: PostPlatform
  status: PostStatus
  text: string
  hashtags: string[]
  scheduledAt: string | null
  createdAt: string
  image: PostImage | null
  citations: PostCitation[]
}
```

**Step 2:** `types/brand.ts` — copy from `src/brand/types.ts`

```ts
export type Platform = 'linkedin' | 'x'

export interface BrandAnalysisResult { /* …copied verbatim… */ }
export interface ConfirmationQuestion { field: string; questionAr: string; options: string[] }
export interface ConfirmationAnswer { field: string; answer: string }
```

**Step 3:** Commit

```bash
git add types/
git commit -m "feat(types): copy backend types (PostListItem, PostDetail, BrandAnalysisResult, …)"
```

### Task 2.2: brand queries (useBrandProfile, useBrandAnalysis, useCreateProfile)

**Files:**
- Create: `queries/useBrandProfile.ts`, `queries/useBrandAnalysis.ts`, `queries/useCreateProfile.ts`

**Step 1:** `queries/useBrandProfile.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { BrandAnalysisResult } from '@/types/brand'

export function useBrandProfile() {
  return useQuery({ queryKey: ['brand', 'profile'], queryFn: () => apiClient.get<BrandAnalysisResult>('/brand/profile') })
}
```

**Step 2:** `queries/useBrandAnalysis.ts` (mutation)

```ts
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { BrandAnalysisResult, ConfirmationAnswer } from '@/types/brand'

export function useBrandAnalysis() {
  return useMutation({
    mutationFn: (input: { website: string; topics: string[] }) =>
      apiClient.post<{ analysis: BrandAnalysisResult; questions: ConfirmationQuestion[] }>('/brand/analyze', input),
  })
}
```

**Step 3:** `queries/useCreateProfile.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { BrandAnalysisResult } from '@/types/brand'

export function useCreateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { analysis: BrandAnalysisResult; answers: ConfirmationAnswer[] }) =>
      apiClient.post<BrandAnalysisResult>('/brand/profile', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['brand', 'profile'] })
    },
  })
}
```

**Step 4:** Tests with MSW (omit verbatim)

**Step 5:** Commit

```bash
git add queries/useBrand*.ts
git commit -m "feat(queries): useBrandProfile + useBrandAnalysis + useCreateProfile"
```

### Task 2.3: ui components — Textarea, Select, Modal, Divider, Tabs

(Analogous pattern; mirror Button. Omit code blocks here for brevity.)

**Commit:**

```bash
git add components/ui/Textarea components/ui/Select components/ui/Modal components/ui/Divider components/ui/Tabs
git commit -m "feat(ui): Textarea + Select + Modal + Divider + Tabs"
```

### Task 2.4: shared components — PageHeader, PlatformBadge, FilterBar, PostCard

(Analogous. PostCard tests verify click callback, status badge presence, accessible Arabic platform label.)

**Commit:**

```bash
git add components/shared/PageHeader components/shared/PlatformBadge components/shared/FilterBar components/shared/PostCard
git commit -m "feat(shared): PageHeader + PlatformBadge + FilterBar + PostCard"
```

### Task 2.5: `/onboarding` wizard page

**Files:**
- Create: `app/(app)/onboarding/page.tsx`
- Create: `app/(app)/onboarding/wizard-state.ts`

**Step 1:** Wizard state (URL-backed via search params, simple — no zustand)

```ts
export type Step = 'input' | 'analysis' | 'confirm' | 'topics' | 'final'

export const STEPS: Step[] = ['input', 'analysis', 'confirm', 'topics', 'final']
export const STEP_LABELS_AR: Record<Step, string> = {
  input: 'أدخل موقعك وحساباتك',
  analysis: 'استنتاجنا',
  confirm: 'أكّد الاستنتاج',
  topics: 'اختر المحاور',
  final: 'اعتمد',
}
```

**Step 2:** Page composition — render step based on URL `?step=...`; persist partial answers in TanStack cache under key `['onboarding']`.

**Step 3:** Tests — wizard renders the correct step for each param value; back/forward navigation preserves state.

**Step 4:** Commit

```bash
git add app/\(app\)/onboarding/
git commit -m "feat(onboarding): 5-step wizard (input → analysis → confirm → topics → final)"
```

### Task 2.6: posts queries (usePosts, usePost, useUpdatePost)

(Analogous. `useUpdatePost` invalidates `['post', id]` and `['posts']`.)

**Commit:**

```bash
git add queries/usePosts.ts queries/usePost.ts queries/useUpdatePost.ts
git commit -m "feat(queries): usePosts + usePost + useUpdatePost"
```

### Task 2.7: shared — SourceList, ImagePreview, CharCounter

**Step 1:** SourceList test + impl

```tsx
export function SourceList({ citations }: { citations: { claim: string; sourceUrl: string }[] }) {
  if (citations.length === 0) return null
  return (
    <ul aria-label="المصادر">
      {citations.map((c, i) => (
        <li key={i}>
          <span>{c.claim}</span>{' '}
          <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">[مصدر]</a>
        </li>
      ))}
    </ul>
  )
}
```

**Step 2:** ImagePreview (overlay fallback)

**Step 3:** CharCounter using `twitter-text`

```tsx
import { twitterText } from '@/lib/twitterText'

export function CharCounter({ value, platform }: { value: string; platform: 'linkedin' | 'x' }) {
  const limit = platform === 'linkedin' ? 3000 : 280
  const weighted = platform === 'x' ? twitterText.parseTweet(value).weightedLength : value.length
  const ratio = weighted / limit
  const tone = ratio >= 1 ? 'over' : ratio > 0.85 ? 'near' : 'under'
  return (
    <span aria-label={`${weighted} من ${limit} حرف`} className={`counter counter-${tone}`}>
      {weighted}/{limit}
    </span>
  )
}
```

**Step 4:** Commit

```bash
git add components/shared/SourceList components/shared/ImagePreview components/shared/CharCounter lib/twitterText.ts
git commit -m "feat(shared): SourceList + ImagePreview + CharCounter (twitter-text)"
```

### Task 2.8: `/posts` list page

**Files:**
- Create: `app/(app)/posts/page.tsx`

```tsx
'use client'
import { useState } from 'react'
import { usePosts } from '@/queries/usePosts'
import { PostCard } from '@/components/shared/PostCard/PostCard'
import { FilterBar } from '@/components/shared/FilterBar/FilterBar'
import { EmptyState } from '@/components/shared/EmptyState/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState/ErrorState'
import { Skeleton } from '@/components/shared/Skeleton/Skeleton'
import { PageHeader } from '@/components/shared/PageHeader/PageHeader'
import { PageContainer } from '@/components/layout/PageContainer/PageContainer'

export default function PostsPage() {
  const [platform, setPlatform] = useState<'linkedin' | 'x' | null>(null)
  const posts = usePosts({ platform: platform ?? undefined })

  return (
    <PageContainer>
      <PageHeader title="البوستات" />
      <FilterBar platform={platform} onPlatformChange={setPlatform} />
      {posts.isLoading && <Skeleton variant="card" count={3} />}
      {posts.isError && <ErrorState onRetry={posts.refetch} />}
      {posts.data?.length === 0 && (
        <EmptyState title="ما عندك بوستات بعد." action={{ label: 'ولّد أول بوست', href: '/generate' }} />
      )}
      <ul>{posts.data?.map((p) => <li key={p.id}><PostCard post={p} /></li>)}</ul>
    </PageContainer>
  )
}
```

**Commit:**

```bash
git add app/\(app\)/posts/page.tsx
git commit -m "feat(posts): /posts list with platform filter + 4-state handling"
```

### Task 2.9: `/posts/[postId]` editor page

**Files:**
- Create: `app/(app)/posts/[postId]/page.tsx`

**Behavior:** text editor with `CharCounter`, `SourceList`, `ImagePreview`, "approve" button (calls `useUpdatePost` with `{ status: 'approved' }`).

**Step 1:** Component composition (omit verbatim).

**Step 2:** E2E test for edit + approve (Playwright).

**Commit:**

```bash
git add app/\(app\)/posts/\[postId\]/
git commit -m "feat(posts): editor page with CharCounter + approve action"
```

### Task 2.10: useGenerate (single-post mutation, async-ready)

**Files:**
- Create: `queries/useGenerate.ts`, `lib/usePollingJob.ts`

**Step 1:** `queries/useGenerate.ts`

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { PostDetail } from '@/types/post'

type GenerateResponse =
  | { status: 'completed'; post: PostDetail }
  | { status: 'queued'; jobId: string }

export function useGenerate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { brandProfileId: string; platform: 'linkedin' | 'x'; topic?: string; brief?: string }) =>
      apiClient.post<GenerateResponse>('/content/generate', input),
    onSuccess: (data) => {
      if (data.status === 'completed') qc.invalidateQueries({ queryKey: ['posts'] })
      // 'queued' handled by the caller using useJobPolling
    },
  })
}
```

**Step 2:** `lib/usePollingJob.ts` (used by both generate-queued and M2.1 month-plan)

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { PostDetail } from '@/types/post'

export type JobStatus = 'running' | 'completed' | 'failed'
export interface JobResult { status: JobStatus; post?: PostDetail; done?: number; total?: number; posts?: PostDetail[]; errorAr?: string }

export function useJobPolling(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.get<JobResult>(`/content/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data) return 2000
      if (data.status === 'completed' || data.status === 'failed') return false
      return 2000
    },
  })
}
```

**Step 3:** Tests (MSW) — completed path; queued → polling → completed path.

**Step 4:** Commit

```bash
git add queries/useGenerate.ts lib/usePollingJob.ts
git commit -m "feat(queries): useGenerate (async-ready) + useJobPolling"
```

### Task 2.11: `/generate` page

**Files:**
- Create: `app/(app)/generate/page.tsx`

**Behavior:** platform select + topic/brief input + "ولّد بوست" button. On completed response → redirect to `/posts/[postId]`. On queued → show polling UI with `useJobPolling`.

**Commit:**

```bash
git add app/\(app\)/generate/page.tsx
git commit -m "feat(generate): single-post generation with async-ready polling"
```

### Task 2.12: enhanced `/dashboard`

**Step 1:** Update `app/(app)/dashboard/page.tsx` — show counts per status + recent posts.

**Commit:**

```bash
git add app/\(app\)/dashboard/page.tsx
git commit -m "feat(dashboard): status counts + recent posts"
```

### Task 2.13: M2 E2E journey

**Files:**
- Create: `e2e/m2-journey.spec.ts`

```ts
import { test, expect } from '@playwright/test'

test('full M2 journey: register → onboarding → generate (single) → edit → approve', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('البريد الإلكتروني').fill('t@e.com')
  await page.getByLabel('كلمة المرور').fill('Passw0rd!')
  await page.getByLabel('اسمك').fill('Tariq')
  await page.getByLabel('اسم شركتك').fill('Acme')
  await page.getByLabel('أوافق على الشروط').check()
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click()
  await expect(page).toHaveURL(/\/onboarding/)

  // …onboarding wizard steps (mock analyze + profile)
  // …generate single
  // …edit post + approve
  // …assert StatusBadge shows 'معتمدة'
})
```

**Commit:**

```bash
git add e2e/m2-journey.spec.ts
git commit -m "test(e2e): full M2 journey (register → onboarding → generate → approve)"
```

### Task 2.14: axe-core a11y audit

**Files:**
- Create: `e2e/a11y.spec.ts`

```ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('dashboard has no critical axe violations', async ({ page }) => {
  await page.goto('/dashboard')
  const results = await new AxeBuilder({ page }).analyze()
  const critical = results.violations.filter((v) => v.impact === 'critical')
  expect(critical).toEqual([])
})
```

**Commit:**

```bash
git add e2e/a11y.spec.ts
git commit -m "test(a11y): axe-core audit on key pages (0 critical violations)"
```

### Task 2.15: M2 final checks

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```

Merge M2 branch to main.

---

## M2.1 — Month Plan

> **Branch:** `tariq/2026-06-30-phase7-m21-month-plan`
> **Blocker:** month-plan portion of `engine-http-surface` backend PR (delivers `POST /content/month-plan` returning `{ jobId }`, and the unified `/content/jobs/:jobId` returns `posts: PostDetail[]` when status is `completed`).
> **Exit criterion:** Playwright journey shows 30 posts created via month-plan polling.

### Task 3.1: useStartMonthPlan + useMonthPlan (polling)

**Files:**
- Create: `queries/useStartMonthPlan.ts`

```ts
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'

export function useStartMonthPlan() {
  return useMutation({
    mutationFn: (input: { count: number }) => apiClient.post<{ jobId: string }>('/content/month-plan', input),
  })
}
```

`useMonthPlan` is `useJobPolling` from M2 Task 2.10 (reused).

**Commit:**

```bash
git add queries/useStartMonthPlan.ts
git commit -m "feat(queries): useStartMonthPlan"
```

### Task 3.2: `/generate` page — month-plan card

**Step 1:** Add a "خطة شهر" card below the single-post form. On submit → `useStartMonthPlan` → on `{ jobId }` → `useJobPolling`. While running show progress (done/total). On completed show links to `/calendar` (V1.1 — display placeholder for now) + status of failed posts.

**Commit:**

```bash
git add app/\(app\)/generate/page.tsx
git commit -m "feat(generate): month-plan card with polling + partial-failure handling"
```

### Task 3.3: M2.1 E2E

```ts
import { test, expect } from '@playwright/test'

test('month plan: start → poll → see 30 posts', async ({ page }) => {
  // login as M2 user
  await page.goto('/generate')
  await page.getByLabel('عدد البوستات').fill('30')
  await page.getByRole('button', { name: 'ابدأ خطة الشهر' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByText('30')).toBeVisible({ timeout: 60_000 })
})
```

**Commit:**

```bash
git add e2e/m21-month-plan.spec.ts
git commit -m "test(e2e): month plan polling"
```

### Task 3.4: M2.1 final + merge

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```

---

## Out of Scope (separate plans later)

- **V1.1 — Calendar + Publish** (date picker + manual publish, no drag-drop). Separate plan once `calendar` + `publishing` controllers are stable.
- **V1.2 — Billing + Settings + Accounts.** Depends on Sprint A merge (`auth-session-hardening` + VAT + HMAC + cancel-at-period-end).
- **V2 — Drag-drop calendar, auto-publish, analytics, dark mode, multiple plans, en content.**

---

## Self-Review

**Spec coverage:**
- ✅ Design System tokens (spec §3, .impeccable.md) — Tasks 1.3–1.4
- ✅ 3-layer component architecture — Tasks 1.10–1.12
- ✅ lucide-react only — referenced in Tasks 1.10–1.12
- ✅ Cookie + CSRF auth + SessionProvider — Tasks 1.7–1.8, 1.14
- ✅ Route UX guard (middleware) vs API authorization guard — Task 1.14 + note
- ✅ WCAG 2.1 AA + AAA selective — referenced in tests across M1 + M2
- ✅ Async-ready generate endpoint — Task 2.10
- ✅ M1 + M2 + M2.1 split — entire structure
- ✅ Backend dependencies named (`auth-session-hardening` before M1, `engine-http-surface` before M2) — pre-flight + plan preamble
- ✅ TanStack Query (no services/hooks layers) — every query is `useQuery`/`useMutation`
- ✅ No Tailwind — ESLint + Stylelint configs ban raw colors + raw spacing outside tokens
- ✅ 4-state UI per screen (loading/empty/error/success) — `/posts` Task 2.8, `/dashboard` Task 2.12

**Placeholder scan:**
- No TBD/TODO except intentional licensing TODO in Task 1.2 (`LICENSING.md`).

**Type consistency:**
- `apiClient.{get,post,patch,delete}<T>(path, body?)` — defined in Task 1.7, used in every query.
- `UnauthorizedError.code = 'UNAUTHORIZED'` — caught by `SessionProvider` (Task 1.8) and `queryClient.retry: false`.
- `PostStatus` and `StatusBadgeKind` — types in Task 1.11 + `types/post.ts` in Task 2.1.
- `useJobPolling({ status, post, done, total, posts })` — defined M2.10, reused by M2 (queued generate) and M2.1 (month plan).

**Cross-milestone dependencies (in-order):**
- M1 → no frontend deps; backend `auth-session-hardening` must be merged.
- M2 → M1 merged + backend `engine-http-surface` (sync path) merged.
- M2.1 → M2 merged + backend `engine-http-surface` (async path) merged.

**Branch strategy (LR-008):**
- Each milestone on its own `tariq/<date>-<slug>` branch.
- Merge to main sequentially (one at a time); `branch-guard.sh` forks on contention.
- Plan files in `docs/superpowers/plans/` live on the planning branch; merge plan with the implementation PR only if the user prefers.

**Estimated effort:** M1 ~5–7 days, M2 ~10–14 days, M2.1 ~3–4 days. Realistic with one frontend dev (Ali) working alongside backend engineer (Tariq) on the `auth-session-hardening` and `engine-http-surface` PRs.