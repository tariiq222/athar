# Phase 7 — Frontend (Athar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Arabic-first, full-RTL, mobile-first Next.js (App Router) frontend for Athar — all 12 screens wired to the backend via a typed `services/` + `hooks/` layer, with shared components (StatusBadge, PostCard, SourceList, ImagePreview, CharCounter, CalendarGrid), a single `apiClient` (JWT inject + 401 handling + error normalization), i18n (ar default, en), and design tokens.

**Architecture:** Next.js App Router with two route groups — `(auth)` (public, no shell) and `(app)` (protected by an auth guard + `AppShell`). No `fetch` in components: every data interaction flows through `services/<domain>.ts` (thin contract wrappers over `apiClient`) then `hooks/` (server-state via TanStack Query with keyed invalidation). Client state lives in three light contexts: `SessionContext`, `LocaleContext`, `ToastContext`. Status display is centralized in `StatusBadge`; the four backend `PostStatus` values plus two frontend-derived states (`scheduled`, `failed`) are computed by one tested pure function. Platform character limits are mirrored *visually only* by `CharCounter` (X via `twitter-text` weighted counting, LinkedIn via `.length`); the backend remains the enforcement authority.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5, TanStack Query v5 (server state), `twitter-text` (X char counting), `next/font` (IBM Plex Sans Arabic), Vitest + React Testing Library + jsdom + `@testing-library/jest-dom` + `@testing-library/user-event` (tests), Tailwind CSS driven exclusively by design tokens (CSS variables).

## Global Constraints

- **Backend base path is `/api/v1`**; `apiClient` prepends it to every request. (from foundation plan `src/main.ts`: `app.setGlobalPrefix('api/v1')`)
- **Code, identifiers, component names, routes, types, hooks, comments, commit messages: English only.** All user-visible text is Arabic and comes from `i18n/` files (`i18n/ar` default, `i18n/en`). No Arabic string literals inside components.
- **No business logic in the frontend.** Generation, search/citation, self-critique, image verification, platform limits as hard rules, billing math, `learnedPreferences` summarization — all backend. The frontend displays, collects input, and calls contracts only.
- **The contract is the boundary:** every data interaction goes through `services/` then `hooks/`. No direct `fetch` from a component.
- **Server state vs client state are separate:** server data via TanStack Query (cache keys per domain: `posts`, `post:[id]`, `calendar:[month]`, `billing`, ...); client state via light React contexts (`SessionContext`, `LocaleContext`, `ToastContext`). Editor drafts/forms are local page state.
- **StatusBadge is the SINGLE source of status display.** Backend `PostStatus` enum returns exactly `draft | pending_review | approved | published`. `scheduled` and `failed` are FRONTEND-DERIVED: `scheduled` = `status === 'approved'` AND `scheduledAt` present; `failed` = a failed month-plan generation attempt (never a `Post.status`). The derivation is a tested pure function `PostSummary → StatusBadgeKind`. Never expect `scheduled`/`failed` from `Post.status`.
- **CharCounter is visual guidance only** (backend enforces). LinkedIn cap **3,000** chars (`.length`); X cap **280** chars **weighted via `twitter-text`** (not `.length`); X Premium **25,000**. (from `docs/blueprint/15-مواصفات-المنصات.md`)
- **Auth (JWT, Phase 3):** access + refresh tokens. `apiClient` injects `Authorization: Bearer <access>`; on 401 it tries one refresh (`POST /auth/refresh { refreshToken }`), else performs a gentle logout → `/login` preserving the intended path. **Storage:** httpOnly cookie preferred (noted fixed with Phase 3 contract); this plan stores tokens via a swappable `tokenStore` abstraction defaulting to httpOnly-cookie-friendly behavior, so the storage decision is isolated to one module.
- **RTL/i18n:** `<html dir="rtl" lang="ar">`; all layouts logical (`start`/`end`, never `left`/`right`); IBM Plex Sans Arabic via `next/font` system-wide; directional icons mirrored in RTL, non-directional icons not; numbers via one `formatNumber` helper.
- **Mobile-first:** design starts at mobile then scales; touch targets ≥44px; `BottomNav` on mobile upgrades to `SideNav` on ≥md; single-column default; no hover-only interactions.
- **Design tokens only:** no raw Tailwind colors, no `dark:` scattered in pages; colors via tokens (CSS variables).
- **TDD:** failing test first → run fails → minimal impl → run passes → commit. Frequent commits.
- **Contracts are directional:** Phase 1–6 contracts firm up per phase. Type `services/` to the documented shapes; where a contract is provisional, the relevant task notes it inline.

## File Structure

```
package.json, tsconfig.json, next.config.mjs, postcss.config.mjs, tailwind.config.ts
vitest.config.ts, vitest.setup.ts, .gitignore, .env.example
app/
  layout.tsx                              # root: dir=rtl lang=ar, font, providers
  globals.css                             # design tokens (CSS variables) + base
  not-found.tsx
  (auth)/layout.tsx                       # bare layout, no AppShell
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (app)/layout.tsx                        # AppShell + auth guard
  (app)/onboarding/page.tsx
  (app)/dashboard/page.tsx
  (app)/posts/page.tsx
  (app)/posts/[postId]/page.tsx
  (app)/generate/page.tsx
  (app)/calendar/page.tsx
  (app)/publish/[postId]/page.tsx
  (app)/billing/page.tsx
  (app)/billing/callback/page.tsx         # Moyasar return URL
  (app)/settings/page.tsx
  (app)/settings/accounts/page.tsx
components/
  shared/StatusBadge.tsx, statusBadge.logic.ts
  shared/PostCard.tsx
  shared/SourceList.tsx
  shared/ImagePreview.tsx
  shared/CharCounter.tsx, charCounter.logic.ts
  shared/CalendarGrid.tsx
  shared/states/{LoadingState,EmptyState,ErrorState}.tsx
  shared/DirectionalIcon.tsx
  layout/{AppShell,BottomNav,SideNav,Header,AuthGuard}.tsx
contexts/{SessionContext,LocaleContext,ToastContext}.tsx
services/{auth,brand,content,posts,calendar,export,billing}.ts
hooks/{useAuth,useSession,useBrandProfile,useBrandAnalysis,useGeneration,
       useMonthPlan,usePosts,usePost,useApprovePost,useCalendar,useReschedule,
       useExportAssets,useMarkPublished,useBilling,useSubscription,useInvoices}.ts
lib/{apiClient,tokenStore,formatNumber,queryClient,queryKeys,dir}.ts
i18n/{index.ts,ar.ts,en.ts}
types/{api.ts,domain.ts}
test/utils/renderWithProviders.tsx
```

---

### Task 1: Project scaffold (Next.js + TypeScript + Vitest + Tailwind tokens)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `.env.example`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Create: `app/globals.css`
- Test: `test/smoke.spec.ts`

**Interfaces:**
- Produces: a booting Next.js app; npm scripts `dev`, `build`, `typecheck`, `lint`, `test`; working Vitest + RTL harness; Tailwind wired to design-token CSS variables.

- [ ] **Step 1: Init repo and install deps**

```bash
cd "/Users/tariq/code/أثر"
git init
npm init -y
npm i next@^14 react@^18 react-dom@^18 @tanstack/react-query@^5 twitter-text@^3
npm i -D typescript @types/react @types/react-dom @types/node \
  vitest@^2 jsdom @testing-library/react @testing-library/dom \
  @testing-library/jest-dom @testing-library/user-event \
  @vitejs/plugin-react tailwindcss postcss autoprefixer eslint eslint-config-next
```

- [ ] **Step 2: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Add config files**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```
`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```
`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

// Colors map to design-token CSS variables only — no raw hex in components.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        primary: 'var(--color-primary)',
        'primary-fg': 'var(--color-primary-fg)',
        success: 'var(--color-success)',
        'success-fg': 'var(--color-success-fg)',
        warning: 'var(--color-warning)',
        'warning-fg': 'var(--color-warning-fg)',
        danger: 'var(--color-danger)',
        'danger-fg': 'var(--color-danger-fg)',
        info: 'var(--color-info)',
        'info-fg': 'var(--color-info-fg)',
        neutral: 'var(--color-neutral)',
        'neutral-fg': 'var(--color-neutral-fg)',
      },
      spacing: { touch: '44px' },
      fontFamily: { sans: ['var(--font-plex-arabic)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
```
`.gitignore`:
```
node_modules/
.next/
.env
next-env.d.ts
coverage/
```
`.env.example`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 4: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Add Vitest config + setup**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
});
```
`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Add `app/globals.css` with design tokens**

```css
:root {
  --color-bg: #f7f8fa;
  --color-surface: #ffffff;
  --color-border: #e2e5ea;
  --color-text: #14181f;
  --color-text-muted: #5b6470;
  --color-primary: #0a6b5e;
  --color-primary-fg: #ffffff;
  --color-success: #d8f3e6;
  --color-success-fg: #0a6b3f;
  --color-warning: #fdedce;
  --color-warning-fg: #8a5a00;
  --color-danger: #fbe0e0;
  --color-danger-fg: #a11212;
  --color-info: #dde9fb;
  --color-info-fg: #134a99;
  --color-neutral: #e9ecf1;
  --color-neutral-fg: #3c4250;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-plex-arabic), system-ui, sans-serif;
}
```

- [ ] **Step 7: Write the smoke test**

`test/smoke.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run smoke test to verify harness works**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with vitest, tailwind tokens"
```

---

### Task 2: i18n dictionaries + LocaleContext + formatNumber

**Files:**
- Create: `i18n/ar.ts`, `i18n/en.ts`, `i18n/index.ts`
- Create: `contexts/LocaleContext.tsx`
- Create: `lib/formatNumber.ts`
- Test: `i18n/index.spec.ts`, `lib/formatNumber.spec.ts`, `contexts/LocaleContext.spec.tsx`

**Interfaces:**
- Produces:
  - `type Locale = 'ar' | 'en'`
  - `type Dict = typeof ar` (ar is the canonical key set)
  - `dictionaries: Record<Locale, Dict>`
  - `getDirection(locale: Locale): 'rtl' | 'ltr'`
  - `LocaleProvider`, `useLocale(): { locale: Locale; dir: 'rtl'|'ltr'; t: (key: DotKey) => string; setLocale: (l: Locale) => void }`
  - `formatNumber(value: number, locale: Locale): string`
- Consumes: nothing.

- [ ] **Step 1: Write failing tests**

`i18n/index.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dictionaries, getDirection, resolveKey } from './index';

describe('i18n', () => {
  it('ar is default and rtl, en is ltr', () => {
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });
  it('en has the same key set as ar (no missing translations)', () => {
    const arKeys = Object.keys(flatten(dictionaries.ar)).sort();
    const enKeys = Object.keys(flatten(dictionaries.en)).sort();
    expect(enKeys).toEqual(arKeys);
  });
  it('resolveKey reads nested dotted keys', () => {
    expect(resolveKey(dictionaries.ar, 'common.retry')).toBe('أعد المحاولة');
  });
});

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else out[key] = '';
    if (typeof v === 'object' && v) Object.assign(out, flatten(v as Record<string, unknown>, key));
  }
  return out;
}
```
`lib/formatNumber.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatNumber } from './formatNumber';

describe('formatNumber', () => {
  it('formats with arabic locale digits', () => {
    expect(formatNumber(1234, 'ar')).toBe('١٬٢٣٤');
  });
  it('formats with western digits for en', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
});
```
`contexts/LocaleContext.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider, useLocale } from './LocaleContext';

function Probe() {
  const { t, dir, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="dir">{dir}</span>
      <span data-testid="label">{t('common.retry')}</span>
      <button onClick={() => setLocale('en')}>switch</button>
    </div>
  );
}

describe('LocaleContext', () => {
  it('defaults to ar/rtl and translates', () => {
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByTestId('dir').textContent).toBe('rtl');
    expect(screen.getByTestId('label').textContent).toBe('أعد المحاولة');
  });
  it('switches locale to en/ltr', async () => {
    render(<LocaleProvider><Probe /></LocaleProvider>);
    await userEvent.click(screen.getByText('switch'));
    expect(screen.getByTestId('dir').textContent).toBe('ltr');
    expect(screen.getByTestId('label').textContent).toBe('Retry');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- i18n lib/formatNumber contexts/LocaleContext`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `i18n/ar.ts`**

```ts
export const ar = {
  common: {
    retry: 'أعد المحاولة',
    loading: 'جارٍ التحميل…',
    save: 'حفظ',
    cancel: 'إلغاء',
    next: 'التالي',
    back: 'رجوع',
    confirm: 'تأكيد',
    open: 'فتح',
    appName: 'أثر',
    networkError: 'تعذّر الاتصال بالخادم. تحقّق من الشبكة وأعد المحاولة.',
    genericError: 'حدث خطأ غير متوقّع.',
  },
  nav: {
    dashboard: 'اللوحة',
    posts: 'البوستات',
    generate: 'توليد',
    calendar: 'التقويم',
    billing: 'الاشتراك',
    settings: 'الإعدادات',
  },
  status: {
    draft: 'مسودّة',
    pending_review: 'بانتظار المراجعة',
    approved: 'معتمد',
    published: 'منشور',
    scheduled: 'مجدول',
    failed: 'فشل التوليد',
  },
  platform: { linkedin: 'لينكدإن', x: 'إكس' },
  auth: {
    loginTitle: 'تسجيل الدخول',
    registerTitle: 'إنشاء حساب',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    tenantName: 'اسم المساحة',
    name: 'الاسم',
    submitLogin: 'دخول',
    submitRegister: 'إنشاء الحساب',
    toRegister: 'ليس لديك حساب؟ أنشئ واحداً',
    toLogin: 'لديك حساب؟ سجّل الدخول',
    invalidCredentials: 'بيانات الدخول غير صحيحة.',
    emailExists: 'هذا البريد مستخدم بالفعل.',
    emailInvalid: 'صيغة البريد غير صحيحة.',
    passwordShort: 'كلمة المرور قصيرة (٨ أحرف على الأقل).',
    required: 'هذا الحقل مطلوب.',
  },
  onboarding: {
    title: 'دماغ الشركة',
    stepInput: 'إدخال البيانات',
    stepAnalysis: 'التحليل',
    stepQuestions: 'أسئلة التأكيد',
    stepTopics: 'المحاور والممنوعات',
    stepReview: 'المراجعة والاعتماد',
    websiteUrl: 'رابط موقع الشركة',
    consent: 'أوافق على جلب وتحليل بيانات موقعي وحساباتي.',
    analyzing: 'جارٍ تحليل بياناتك…',
    suggestedTopics: 'محاور مقترحة',
    addTopic: 'أضف محوراً',
    prohibitions: 'الممنوعات',
    addProhibition: 'أضف ممنوعاً',
    finish: 'اعتمد وأنشئ البروفايل',
    incompleteTitle: 'أكمل دماغ الشركة',
    incompleteBody: 'لتوليد المحتوى، أكمل إعداد دماغ الشركة أولاً.',
    goToOnboarding: 'أكمل الآن',
  },
  dashboard: {
    title: 'اللوحة',
    countsTitle: 'البوستات حسب الحالة',
    upcoming: 'أقرب البوستات المجدولة',
    quickGenerate: 'ولّد بوست',
    quickMonthPlan: 'خطة شهر',
    noUpcoming: 'لا بوستات مجدولة بعد.',
  },
  posts: {
    title: 'البوستات',
    empty: 'لا بوستات بعد.',
    generateFirst: 'ولّد أول بوست',
    filterStatus: 'تصفية بالحالة',
    filterPlatform: 'تصفية بالمنصة',
    all: 'الكل',
  },
  editor: {
    title: 'محرّر البوست',
    sources: 'المصادر',
    save: 'حفظ التعديل',
    approve: 'اعتماد',
    regenerate: 'إعادة توليد',
    issuesTitle: 'ملاحظات الجودة',
    contentLocked: 'لا يمكن تعديل بوست معتمد.',
    saved: 'تم حفظ التعديل.',
    approved: 'تم اعتماد البوست.',
  },
  generate: {
    title: 'توليد',
    single: 'بوست مفرد',
    monthPlan: 'خطة شهر',
    platform: 'المنصة',
    contentType: 'نوع المحتوى',
    topic: 'المحور (اختياري)',
    brief: 'توجيه مختصر (اختياري)',
    generate: 'ولّد بوست',
    count: 'عدد البوستات',
    startPlan: 'ابدأ خطة الشهر',
    progress: 'تقدّم التوليد',
    planDone: 'اكتملت الخطة',
    viewCalendar: 'افتح التقويم',
    failedRetry: 'أعد توليد الفاشل',
    generateFailed: 'تعذّر التوليد.',
    ctInformational: 'معلوماتي',
    ctThought: 'رأي وقيادة فكرية',
    ctAnnouncement: 'إعلان',
    ctEngagement: 'تفاعلي',
  },
  calendar: {
    title: 'التقويم',
    empty: 'لا مناسبات أو بوستات هذا الشهر.',
    reschedule: 'إعادة جدولة',
    pickDate: 'اختر التاريخ',
    prevMonth: 'الشهر السابق',
    nextMonth: 'الشهر التالي',
  },
  publish: {
    title: 'النشر اليدوي',
    copyText: 'انسخ النص',
    copied: 'تم النسخ.',
    downloadImage: 'نزّل الصورة',
    downloaded: 'تم التنزيل.',
    openPlatform: 'افتح المنصة',
    markPublished: 'علّم «تم النشر»',
    marked: 'تم تعليم البوست كمنشور.',
    notApproved: 'يجب اعتماد البوست قبل النشر.',
    exceedsLimit: 'النص يتجاوز حدّ المنصة؛ راجعه قبل النشر.',
    linkHintBody: 'الصق الرابط في متن البوست واحذف بطاقة المعاينة.',
    linkHintReply: 'ضع الرابط في ردٍّ لا في المتن.',
  },
  billing: {
    title: 'الاشتراك والفوترة',
    currentPlan: 'باقتك الحالية',
    usageDrafts: 'المسودّات',
    usageImages: 'الصور',
    usageSearches: 'عمليات البحث',
    upgrade: 'ترقية / اشتراك',
    cancel: 'إلغاء الاشتراك',
    invoices: 'الفواتير',
    noInvoices: 'لا فواتير بعد.',
    downloadInvoice: 'تنزيل الفاتورة',
    quotaExceededTitle: 'بلغت حدّ باقتك',
    quotaExceededBody: 'لتوليد المزيد، رقِّ باقتك.',
    goToBilling: 'رقِّ الآن',
    trialEnded: 'انتهت فترة التجربة.',
    paymentReturn: 'جارٍ تأكيد الدفع…',
    used: 'مستخدم',
    of: 'من',
  },
  settings: {
    title: 'الإعدادات',
    accountTitle: 'بيانات الحساب',
    language: 'اللغة',
    arabic: 'العربية',
    english: 'الإنجليزية',
    logout: 'تسجيل الخروج',
    accountsTitle: 'ملفات الحسابات',
    addAccount: 'اربط حساباً',
    handle: 'المعرّف',
    remove: 'حذف',
    accountsEmpty: 'لا حسابات مربوطة بعد.',
  },
  image: {
    loading: 'جارٍ تحميل الصورة…',
    failed: 'تعذّر تحميل الصورة.',
    textOnly: 'نص فقط (بدون صورة)',
    alt: 'صورة البوست',
  },
  charCounter: { within: 'ضمن الحدّ', near: 'اقتربت من الحدّ', over: 'تجاوزت الحدّ' },
} as const;

export type Dict = typeof ar;
```

- [ ] **Step 4: Implement `i18n/en.ts`** (same key set; English values)

```ts
import type { Dict } from './ar';

export const en: Dict = {
  common: {
    retry: 'Retry', loading: 'Loading…', save: 'Save', cancel: 'Cancel',
    next: 'Next', back: 'Back', confirm: 'Confirm', open: 'Open', appName: 'Athar',
    networkError: 'Could not reach the server. Check your connection and retry.',
    genericError: 'An unexpected error occurred.',
  },
  nav: { dashboard: 'Dashboard', posts: 'Posts', generate: 'Generate', calendar: 'Calendar', billing: 'Billing', settings: 'Settings' },
  status: { draft: 'Draft', pending_review: 'Pending review', approved: 'Approved', published: 'Published', scheduled: 'Scheduled', failed: 'Generation failed' },
  platform: { linkedin: 'LinkedIn', x: 'X' },
  auth: {
    loginTitle: 'Sign in', registerTitle: 'Create account', email: 'Email', password: 'Password',
    tenantName: 'Workspace name', name: 'Name', submitLogin: 'Sign in', submitRegister: 'Create account',
    toRegister: "Don't have an account? Create one", toLogin: 'Have an account? Sign in',
    invalidCredentials: 'Invalid credentials.', emailExists: 'This email is already in use.',
    emailInvalid: 'Invalid email format.', passwordShort: 'Password too short (min 8 chars).', required: 'This field is required.',
  },
  onboarding: {
    title: 'Brand brain', stepInput: 'Input', stepAnalysis: 'Analysis', stepQuestions: 'Confirmation questions',
    stepTopics: 'Topics & prohibitions', stepReview: 'Review & approve', websiteUrl: 'Company website URL',
    consent: 'I agree to fetch and analyze my website and accounts.', analyzing: 'Analyzing your data…',
    suggestedTopics: 'Suggested topics', addTopic: 'Add topic', prohibitions: 'Prohibitions', addProhibition: 'Add prohibition',
    finish: 'Approve & create profile', incompleteTitle: 'Complete your brand brain',
    incompleteBody: 'To generate content, finish setting up your brand brain first.', goToOnboarding: 'Continue now',
  },
  dashboard: {
    title: 'Dashboard', countsTitle: 'Posts by status', upcoming: 'Upcoming scheduled posts',
    quickGenerate: 'Generate a post', quickMonthPlan: 'Month plan', noUpcoming: 'No scheduled posts yet.',
  },
  posts: {
    title: 'Posts', empty: 'No posts yet.', generateFirst: 'Generate your first post',
    filterStatus: 'Filter by status', filterPlatform: 'Filter by platform', all: 'All',
  },
  editor: {
    title: 'Post editor', sources: 'Sources', save: 'Save changes', approve: 'Approve', regenerate: 'Regenerate',
    issuesTitle: 'Quality notes', contentLocked: 'An approved post cannot be edited.', saved: 'Changes saved.', approved: 'Post approved.',
  },
  generate: {
    title: 'Generate', single: 'Single post', monthPlan: 'Month plan', platform: 'Platform', contentType: 'Content type',
    topic: 'Topic (optional)', brief: 'Short brief (optional)', generate: 'Generate post', count: 'Number of posts',
    startPlan: 'Start month plan', progress: 'Generation progress', planDone: 'Plan complete', viewCalendar: 'Open calendar',
    failedRetry: 'Retry failed', generateFailed: 'Generation failed.',
    ctInformational: 'Informational', ctThought: 'Thought leadership', ctAnnouncement: 'Announcement', ctEngagement: 'Engagement',
  },
  calendar: {
    title: 'Calendar', empty: 'No occasions or posts this month.', reschedule: 'Reschedule', pickDate: 'Pick a date',
    prevMonth: 'Previous month', nextMonth: 'Next month',
  },
  publish: {
    title: 'Manual publish', copyText: 'Copy text', copied: 'Copied.', downloadImage: 'Download image', downloaded: 'Downloaded.',
    openPlatform: 'Open platform', markPublished: 'Mark as published', marked: 'Post marked as published.',
    notApproved: 'The post must be approved before publishing.', exceedsLimit: 'Text exceeds the platform limit; review before publishing.',
    linkHintBody: 'Paste the link in the body and remove the preview card.', linkHintReply: 'Put the link in a reply, not the body.',
  },
  billing: {
    title: 'Subscription & billing', currentPlan: 'Your current plan', usageDrafts: 'Drafts', usageImages: 'Images',
    usageSearches: 'Searches', upgrade: 'Upgrade / subscribe', cancel: 'Cancel subscription', invoices: 'Invoices',
    noInvoices: 'No invoices yet.', downloadInvoice: 'Download invoice', quotaExceededTitle: 'You reached your plan limit',
    quotaExceededBody: 'To generate more, upgrade your plan.', goToBilling: 'Upgrade now', trialEnded: 'Your trial has ended.',
    paymentReturn: 'Confirming payment…', used: 'used', of: 'of',
  },
  settings: {
    title: 'Settings', accountTitle: 'Account details', language: 'Language', arabic: 'Arabic', english: 'English',
    logout: 'Sign out', accountsTitle: 'Account profiles', addAccount: 'Link an account', handle: 'Handle', remove: 'Remove',
    accountsEmpty: 'No linked accounts yet.',
  },
  image: { loading: 'Loading image…', failed: 'Could not load image.', textOnly: 'Text only (no image)', alt: 'Post image' },
  charCounter: { within: 'Within limit', near: 'Near limit', over: 'Over limit' },
};
```

- [ ] **Step 5: Implement `i18n/index.ts`**

```ts
import { ar, type Dict } from './ar';
import { en } from './en';

export type Locale = 'ar' | 'en';
export const dictionaries: Record<Locale, Dict> = { ar, en };
export const DEFAULT_LOCALE: Locale = 'ar';

export function getDirection(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

// Reads a dotted key path ("editor.save") from a dictionary; returns the key if missing.
export function resolveKey(dict: Dict, key: string): string {
  const parts = key.split('.');
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof node === 'string' ? node : key;
}

// DotKey is a permissive string; the en===ar key-parity test guards completeness.
export type DotKey = string;
```

- [ ] **Step 6: Implement `lib/formatNumber.ts`**

```ts
import type { Locale } from '@/i18n';

export function formatNumber(value: number, locale: Locale): string {
  const bcp47 = locale === 'ar' ? 'ar-SA' : 'en-US';
  return new Intl.NumberFormat(bcp47).format(value);
}
```

- [ ] **Step 7: Implement `contexts/LocaleContext.tsx`**

```tsx
'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, getDirection, resolveKey, DEFAULT_LOCALE, type Locale, type DotKey } from '@/i18n';

interface LocaleValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: (key: DotKey) => string;
  setLocale: (l: Locale) => void;
}

const LocaleCtx = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children, initial = DEFAULT_LOCALE }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initial);
  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      dir: getDirection(locale),
      t: (key) => resolveKey(dictionaries[locale], key),
      setLocale,
    }),
    [locale],
  );
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): LocaleValue {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- i18n lib/formatNumber contexts/LocaleContext`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add i18n contexts/LocaleContext.tsx lib/formatNumber.ts
git commit -m "feat: add i18n dictionaries, LocaleContext, formatNumber"
```

---

### Task 3: Shared API & domain types

**Files:**
- Create: `types/api.ts`, `types/domain.ts`
- Test: `types/domain.spec.ts`

**Interfaces:**
- Produces (consumed by every service/hook/component below). Typed to documented Phase 1–6 contract shapes; provisional fields noted inline.
  - `types/domain.ts`: `Platform`, `ContentType`, `PostStatus`, `Citation`, `ImageAsset`, `Post`, `PostListItem`, `PostSummary`, `BrandKit`, `BrandProfile`, `SaudiOccasion`, `CalendarPostSummary`, `CalendarEntry`, `Subscription`/`SubscriptionDisplay`, `Invoice`, `AccountProfile`, `User`, `SessionUser`.
  - `types/api.ts`: `ApiError`, request/response DTOs (`AuthTokens`, `LoginDto`, `RegisterDto`, `GenerationRequest`, `MonthPlanProgress`, `ExportPayload`, `SubscribeRequest`, `SubscribeResponse`, etc.).

- [ ] **Step 1: Write failing test (type smoke via runtime guard fixtures)**

`types/domain.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Post, PostSummary, CalendarEntry } from './domain';

describe('domain types', () => {
  it('a Post fixture is assignable', () => {
    const p: Post = {
      id: 'p1', tenantId: 't1', brandProfileId: 'b1', platform: 'x',
      status: 'approved', text: 'hello', hashtags: ['#a'], scheduledAt: '2026-07-01T10:00:00Z',
      image: null, citations: [], issues: [], createdAt: '2026-06-29T00:00:00Z',
    };
    expect(p.status).toBe('approved');
  });
  it('a PostSummary derives from list item fields', () => {
    const s: PostSummary = { id: 'p1', platform: 'linkedin', status: 'approved', scheduledAt: '2026-07-01T10:00:00Z', excerpt: 'x', thumbnailUrl: undefined };
    expect(s.platform).toBe('linkedin');
  });
  it('a calendar occasion entry is valid', () => {
    const e: CalendarEntry = { type: 'occasion', date: '2026-09-23', occasion: { id: 'o1', tenantId: null, slug: 'saudi-national-day', kind: 'national', nameAr: 'اليوم الوطني', nameEn: 'National Day', startDate: '2026-09-23', endDate: '2026-09-23', hijriYear: 1448, gregorianYear: 2026 } };
    expect(e.type).toBe('occasion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- types/domain`
Expected: FAIL — module `./domain` not found.

- [ ] **Step 3: Implement `types/domain.ts`**

```ts
export type Platform = 'linkedin' | 'x';
export type ContentType = 'informational' | 'thought' | 'announcement' | 'engagement';

// Backend PostStatus enum — exactly four values (foundation plan + Phase 4).
export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'published';

export interface Citation {
  claim: string;
  sourceUrl: string;
}

export interface ImageAsset {
  url: string;
  verifiedText: string;
  method: 'gpt-image' | 'overlay-fallback';
  attempts: number;
}

// Full Post (GET /posts/:id). scheduledAt nullable; issues from self-critique. (Phase 4 / doc 16)
export interface Post {
  id: string;
  tenantId: string;
  brandProfileId: string;
  platform: Platform;
  status: PostStatus;
  text: string;
  hashtags: string[];
  scheduledAt: string | null;
  image: ImageAsset | null;
  citations: Citation[];
  issues: string[];
  createdAt: string;
}

// List row (GET /posts). (Phase 4)
export interface PostListItem {
  id: string;
  platform: Platform;
  status: PostStatus;
  scheduledAt: string | null;
  text: string;
  hashtags: string[];
  hasImage: boolean;
  citationCount: number;
}

// Card/badge-facing summary. excerpt+thumbnailUrl provisional (derived client-side from PostListItem if absent).
export interface PostSummary {
  id: string;
  platform: Platform;
  status: PostStatus;
  scheduledAt: string | null;
  excerpt?: string;
  thumbnailUrl?: string;
}

export interface BrandKit {
  colors: string[];
  logoUrl?: string;
  visualStyle: string;
  font: string;
}

// Phase 2 contract.
export interface BrandProfile {
  id: string;
  tenantId: string;
  tone: string;
  audience: string;
  goals: string;
  topics: string[];
  prohibitions: string[];
  competitors: string[];
  keywords: string[];
  brandKit: BrandKit;
  learnedPreferences: string;
  createdAt: string;
  updatedAt: string;
}

export type SaudiOccasionKind =
  | 'national' | 'foundation' | 'ramadan' | 'eid_fitr' | 'eid_adha' | 'commercial';

// Phase 4 calendar. tenantId null = shared occasion.
export interface SaudiOccasion {
  id: string;
  tenantId: string | null;
  slug: string;
  kind: SaudiOccasionKind;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  hijriYear: number;
  gregorianYear: number;
}

export interface CalendarPostSummary {
  id: string;
  platform: Platform;
  status: PostStatus;
  scheduledAt: string | null;
  excerpt: string;
  hasImage: boolean;
}

export type CalendarEntryType = 'occasion' | 'post';

export interface CalendarEntry {
  type: CalendarEntryType;
  date: string;
  occasion?: SaudiOccasion;
  post?: CalendarPostSummary;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

// Phase 6 display DTO (GET /billing/subscription).
export interface SubscriptionDisplay {
  status: SubscriptionStatus;
  planCode: string;
  priceSar: number;
  cycle: 'monthly' | 'annual';
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  usage: {
    drafts: { used: number; cap: number };
    images: { used: number; cap: number };
    searches: { used: number; cap: number };
  };
}

// Phase 6 invoice (GET /billing/invoice/:id). Amounts in halala (minor units).
export interface Invoice {
  id: string;
  tenantId: string;
  subscriptionId: string;
  number: string;
  issuedAt: string;
  totalMinor: number;
  currency: 'SAR';
  sellerName: string;
  buyerName: string;
  status: 'issued' | 'refunded';
}

// Phase 3.
export interface AccountProfile {
  id: string;
  tenantId: string;
  brandProfileId: string;
  platform: Platform;
  handle?: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

// GET /me response (Phase 3). hasBrandProfile is provisional: derived frontend-side from
// presence of a brand profile when the backend does not expose an explicit flag.
export interface SessionUser {
  user: User;
  tenant: { id: string; name: string };
  subscription: { status: SubscriptionStatus; plan: string; trialEndsAt?: string };
  hasBrandProfile?: boolean;
}
```

- [ ] **Step 4: Implement `types/api.ts`**

```ts
import type {
  Platform, ContentType, Post, BrandProfile, BrandKit, AccountProfile,
} from './domain';

// Normalized error shape every hook consumes (apiClient produces it). (spec lib/apiClient)
export interface ApiError {
  code: string;
  messageAr: string;
  status: number;
}

// Phase 3 auth.
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
export interface LoginDto { email: string; password: string; }
export interface RegisterDto { tenantName: string; email: string; password: string; name?: string; }
export interface RefreshDto { refreshToken: string; }

// Phase 2 brand analysis (synchronous: returns analysis + questions in one call).
export interface AccountInput { platform: Platform; handle?: string; }
export interface OnboardingInput { websiteUrl?: string; accounts: AccountInput[]; consentAccepted: boolean; }
export interface BrandAnalysisResult {
  source: 'website' | 'accounts' | 'mixed' | 'manual';
  tone: string;
  products: string[];
  audience: string;
  keywords: string[];
  suggestedTopics: string[];
  suggestedCompetitors: string[];
  confidence: number;
  notes: string[];
}
export interface ConfirmationQuestion {
  id: string;
  field: 'tone' | 'prohibitions' | 'competitors' | 'goals' | 'topics';
  prompt: string;
  kind: 'single' | 'multi' | 'text';
  suggestions?: string[];
  required: boolean;
}
export interface BrandAnalysisResponse { analysis: BrandAnalysisResult; questions: ConfirmationQuestion[]; }
export interface BrandProfileDraft {
  tone: string; audience: string; goals: string; topics: string[];
  prohibitions: string[]; competitors: string[]; keywords: string[]; brandKit: BrandKit;
}
export interface CreateBrandProfileRequest { draft: BrandProfileDraft; accounts: AccountInput[]; }

// Phase 1 generation (doc 16). Provisional async month-plan via jobId polling.
export interface GenerationRequest { platform: Platform; contentType: ContentType; brief?: string; topic?: string; }
export interface MonthPlanStartRequest { count: number; }
export interface MonthPlanStartResponse { jobId: string; }
export interface MonthPlanFailedPost { postId: string; error: string; code: 'provider_error' | 'skipped_quota'; }
export interface MonthPlanProgress {
  jobId: string;
  done: number;
  total: number;
  status: 'running' | 'completed' | 'failed';
  failedPosts?: MonthPlanFailedPost[];
}

// Phase 4 posts mutations.
export interface PatchPostRequest {
  text?: string;
  hashtags?: string[];
  scheduledAt?: string | null;
  transition?: { from: Post['status']; to: Post['status'] };
}

// Phase 5 export (manual publish).
export interface ExportLink { url: string; placement: 'in_body' | 'first_reply'; }
export interface ExportPayload {
  postId: string;
  platform: Platform;
  formattedText: string;
  imageUrl?: string;
  deepLink: string;
  link?: ExportLink;
  charCount: number;
  limitMax: number;
  notes: string[];
}
export interface MarkPublishedRequest { publishedAt?: string; }
export interface MarkPublishedResult { postId: string; status: 'published'; publishedAt: string; }

// Phase 6 billing (Moyasar).
export interface SubscribeRequest { planCode: string; cycle: 'monthly' | 'annual'; }
export interface SubscribeResponse {
  publishableKey: string;
  amount: number;
  currency: 'SAR';
  callbackUrl: string;
  metadata: { tenant_id: string; plan_code: string; cycle: string };
}

export type { Platform, ContentType, Post, BrandProfile, AccountProfile };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- types/domain && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add types
git commit -m "feat: add shared api and domain types for phases 1-6 contracts"
```

---

### Task 4: tokenStore + apiClient (JWT inject, 401 refresh/logout, error normalization)

**Files:**
- Create: `lib/tokenStore.ts`, `lib/apiClient.ts`
- Test: `lib/tokenStore.spec.ts`, `lib/apiClient.spec.ts`

**Interfaces:**
- Consumes: `ApiError`, `AuthTokens`, `RefreshDto` (Task 3).
- Produces:
  - `tokenStore`: `{ getAccess(): string | null; getRefresh(): string | null; set(tokens: AuthTokens): void; clear(): void }`.
  - `apiClient`: `{ get<T>(path, opts?): Promise<T>; post<T>(path, body?, opts?): Promise<T>; patch<T>(path, body?, opts?): Promise<T>; del<T>(path, opts?): Promise<T> }` — prepends `/api/v1`, injects `Authorization: Bearer`, on 401 tries one refresh then retries; on refresh failure calls `onAuthFailure(intendedPath)` and throws `ApiError`. Non-2xx → `ApiError`.
  - `setAuthFailureHandler(fn: (intendedPath: string) => void): void`.
  - `ApiClientOptions = { signal?: AbortSignal; skipAuth?: boolean }`.

- [ ] **Step 1: Write failing tests**

`lib/tokenStore.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStore } from './tokenStore';

describe('tokenStore', () => {
  beforeEach(() => tokenStore.clear());
  it('stores and reads tokens', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    expect(tokenStore.getAccess()).toBe('a');
    expect(tokenStore.getRefresh()).toBe('r');
  });
  it('clears tokens', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    tokenStore.clear();
    expect(tokenStore.getAccess()).toBeNull();
  });
});
```
`lib/apiClient.spec.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiClient, setAuthFailureHandler } from './apiClient';
import { tokenStore } from './tokenStore';

const ENV_BASE = 'http://localhost:3000';

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
}

describe('apiClient', () => {
  beforeEach(() => { tokenStore.clear(); vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it('prepends /api/v1 and injects bearer token', async () => {
    tokenStore.set({ accessToken: 'tok', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => mockFetchOnce(200, { ok: true }));
    await apiClient.get('/posts');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${ENV_BASE}/api/v1/posts`);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('normalizes a non-2xx error into ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      mockFetchOnce(409, { code: 'EMAIL_ALREADY_EXISTS', message: 'مستخدم' }),
    );
    await expect(apiClient.post('/auth/register', {})).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS', status: 409, messageAr: 'مستخدم',
    });
  });

  it('on 401 refreshes once then retries the original request', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => mockFetchOnce(401, { code: 'TOKEN_EXPIRED', message: 'انتهى' }))
      .mockImplementationOnce(() => mockFetchOnce(200, { accessToken: 'new', refreshToken: 'r2', tokenType: 'Bearer', expiresIn: 900 }))
      .mockImplementationOnce(() => mockFetchOnce(200, { ok: true }));
    const res = await apiClient.get<{ ok: boolean }>('/posts');
    expect(res.ok).toBe(true);
    expect(tokenStore.getAccess()).toBe('new');
    expect(spy.mock.calls[1][0]).toBe(`${ENV_BASE}/api/v1/auth/refresh`);
  });

  it('on 401 with failed refresh clears tokens and calls auth-failure handler', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'bad', tokenType: 'Bearer', expiresIn: 900 });
    const onFail = vi.fn();
    setAuthFailureHandler(onFail);
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => mockFetchOnce(401, { code: 'TOKEN_EXPIRED', message: 'انتهى' }))
      .mockImplementationOnce(() => mockFetchOnce(401, { code: 'INVALID_REFRESH_TOKEN', message: 'غير صالح' }));
    await expect(apiClient.get('/posts', { intendedPath: '/dashboard' })).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.getAccess()).toBeNull();
    expect(onFail).toHaveBeenCalledWith('/dashboard');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/tokenStore lib/apiClient`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/tokenStore.ts`**

```ts
import type { AuthTokens } from '@/types/api';

// In-memory token store. Storage mechanism is isolated here: the Phase 3 contract
// may switch this to httpOnly cookies (preferred); only this module changes.
let access: string | null = null;
let refresh: string | null = null;

export const tokenStore = {
  getAccess(): string | null { return access; },
  getRefresh(): string | null { return refresh; },
  set(tokens: AuthTokens): void { access = tokens.accessToken; refresh = tokens.refreshToken; },
  clear(): void { access = null; refresh = null; },
};
```

- [ ] **Step 4: Implement `lib/apiClient.ts`**

```ts
import type { ApiError, AuthTokens } from '@/types/api';
import { tokenStore } from './tokenStore';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const PREFIX = '/api/v1';

export interface ApiClientOptions {
  signal?: AbortSignal;
  skipAuth?: boolean;
  intendedPath?: string;
}

type AuthFailureHandler = (intendedPath: string) => void;
let authFailureHandler: AuthFailureHandler = () => {};
export function setAuthFailureHandler(fn: AuthFailureHandler): void { authFailureHandler = fn; }

function isApiError(x: unknown): x is ApiError {
  return !!x && typeof x === 'object' && 'code' in x && 'status' in x;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'UNKNOWN';
  let messageAr = '';
  try {
    const body = (await res.json()) as { code?: string; error?: string; message?: string };
    code = body.code ?? body.error ?? code;
    messageAr = body.message ?? '';
  } catch {
    // non-JSON body
  }
  return { code, messageAr, status: res.status };
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}${PREFIX}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const tokens = (await res.json()) as AuthTokens;
  tokenStore.set(tokens);
  return true;
}

interface RequestConfig {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  opts?: ApiClientOptions;
}

async function doFetch(cfg: RequestConfig): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cfg.body !== undefined) headers['content-type'] = 'application/json';
  if (!cfg.opts?.skipAuth) {
    const access = tokenStore.getAccess();
    if (access) headers.Authorization = `Bearer ${access}`;
  }
  return fetch(`${BASE}${PREFIX}${cfg.path}`, {
    method: cfg.method,
    headers,
    body: cfg.body !== undefined ? JSON.stringify(cfg.body) : undefined,
    signal: cfg.opts?.signal,
    credentials: 'include',
  });
}

async function request<T>(cfg: RequestConfig): Promise<T> {
  let res = await doFetch(cfg);

  if (res.status === 401 && !cfg.opts?.skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      res = await doFetch(cfg);
    } else {
      tokenStore.clear();
      authFailureHandler(cfg.opts?.intendedPath ?? '/dashboard');
      throw await toApiError(res);
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  get<T>(path: string, opts?: ApiClientOptions): Promise<T> { return request<T>({ method: 'GET', path, opts }); },
  post<T>(path: string, body?: unknown, opts?: ApiClientOptions): Promise<T> { return request<T>({ method: 'POST', path, body, opts }); },
  patch<T>(path: string, body?: unknown, opts?: ApiClientOptions): Promise<T> { return request<T>({ method: 'PATCH', path, body, opts }); },
  del<T>(path: string, opts?: ApiClientOptions): Promise<T> { return request<T>({ method: 'DELETE', path, opts }); },
};

export { isApiError };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- lib/tokenStore lib/apiClient`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/tokenStore.ts lib/apiClient.ts
git commit -m "feat: add tokenStore and apiClient with 401 refresh and error normalization"
```

---

### Task 5: queryClient + queryKeys + renderWithProviders test util

**Files:**
- Create: `lib/queryClient.ts`, `lib/queryKeys.ts`
- Create: `test/utils/renderWithProviders.tsx`
- Test: `lib/queryKeys.spec.ts`

**Interfaces:**
- Consumes: TanStack Query, `LocaleProvider` (Task 2).
- Produces:
  - `makeQueryClient(): QueryClient` (test-safe defaults: `retry: false`).
  - `queryKeys`: `{ posts: (filters?) => unknown[]; post: (id) => unknown[]; calendar: (month) => unknown[]; billing: () => unknown[]; invoices: () => unknown[]; session: () => unknown[]; brandProfile: (id) => unknown[]; monthPlan: (jobId) => unknown[]; accounts: () => unknown[] }`.
  - `renderWithProviders(ui, opts?)` — wraps in `QueryClientProvider` + `LocaleProvider` + `ToastProvider` + `SessionProvider`; returns RTL result.

- [ ] **Step 1: Write failing test**

`lib/queryKeys.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { queryKeys } from './queryKeys';

describe('queryKeys', () => {
  it('post key includes id', () => {
    expect(queryKeys.post('p1')).toEqual(['post', 'p1']);
  });
  it('calendar key includes month', () => {
    expect(queryKeys.calendar('2026-07')).toEqual(['calendar', '2026-07']);
  });
  it('posts key includes filters when given', () => {
    expect(queryKeys.posts({ status: 'draft' })).toEqual(['posts', { status: 'draft' }]);
  });
  it('posts key is stable with no filters', () => {
    expect(queryKeys.posts()).toEqual(['posts', {}]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/queryKeys`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/queryKeys.ts`**

```ts
import type { PostStatus, Platform } from '@/types/domain';

export interface PostFilters { status?: PostStatus; platform?: Platform; }

export const queryKeys = {
  session: () => ['session'] as const,
  brandProfile: (id: string) => ['brandProfile', id] as const,
  posts: (filters: PostFilters = {}) => ['posts', filters] as const,
  post: (id: string) => ['post', id] as const,
  calendar: (month: string) => ['calendar', month] as const,
  monthPlan: (jobId: string) => ['monthPlan', jobId] as const,
  billing: () => ['billing'] as const,
  invoices: () => ['invoices'] as const,
  accounts: () => ['accounts'] as const,
};
```

- [ ] **Step 4: Implement `lib/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 5: Implement `test/utils/renderWithProviders.tsx`** (depends on ToastProvider + SessionProvider from Tasks 6–7; this util is finalized in Task 7. For now create with Locale + Query only, then extend in Task 7.)

```tsx
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactElement, type ReactNode } from 'react';
import { makeQueryClient } from '@/lib/queryClient';
import { LocaleProvider } from '@/contexts/LocaleContext';

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const client = makeQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <LocaleProvider>{children}</LocaleProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- lib/queryKeys`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/queryClient.ts lib/queryKeys.ts test/utils/renderWithProviders.tsx
git commit -m "feat: add queryClient, queryKeys, and test provider harness"
```

---

### Task 6: ToastContext

**Files:**
- Create: `contexts/ToastContext.tsx`
- Test: `contexts/ToastContext.spec.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ToastProvider`, `useToast(): { toasts: Toast[]; show: (msg: string, kind?: ToastKind) => void; dismiss: (id: string) => void }`; `type ToastKind = 'success' | 'error' | 'info'`; `interface Toast { id: string; message: string; kind: ToastKind }`.

- [ ] **Step 1: Write failing test**

`contexts/ToastContext.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function Probe() {
  const { toasts, show } = useToast();
  return (
    <div>
      <button onClick={() => show('done', 'success')}>fire</button>
      <ul>{toasts.map((t) => <li key={t.id} data-kind={t.kind}>{t.message}</li>)}</ul>
    </div>
  );
}

describe('ToastContext', () => {
  it('shows a toast with kind', async () => {
    render(<ToastProvider><Probe /></ToastProvider>);
    await userEvent.click(screen.getByText('fire'));
    const item = screen.getByText('done');
    expect(item).toBeInTheDocument();
    expect(item.getAttribute('data-kind')).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- contexts/ToastContext`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `contexts/ToastContext.tsx`**

```tsx
'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: string; message: string; kind: ToastKind; }

interface ToastValue {
  toasts: Toast[];
  show: (message: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);
  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-touch start-4 end-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              t.kind === 'success' ? 'bg-success text-success-fg rounded p-3'
              : t.kind === 'error' ? 'bg-danger text-danger-fg rounded p-3'
              : 'bg-info text-info-fg rounded p-3'
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- contexts/ToastContext`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contexts/ToastContext.tsx
git commit -m "feat: add ToastContext with accessible live region"
```

---

### Task 7: SessionContext + finalize renderWithProviders

**Files:**
- Create: `contexts/SessionContext.tsx`
- Modify: `test/utils/renderWithProviders.tsx`
- Test: `contexts/SessionContext.spec.tsx`

**Interfaces:**
- Consumes: `tokenStore` (Task 4), `SessionUser` (Task 3), `AuthTokens`.
- Produces: `SessionProvider`, `useSessionContext(): { user: SessionUser | null; setUser: (u: SessionUser | null) => void; setTokens: (t: AuthTokens) => void; clear: () => void; isAuthenticated: boolean }`.
- Produces (modified): `renderWithProviders` now wraps in Session + Toast + Locale + Query, accepts `{ user?: SessionUser | null }`.

- [ ] **Step 1: Write failing test**

`contexts/SessionContext.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSessionContext } from './SessionContext';

function Probe() {
  const { isAuthenticated, setUser } = useSessionContext();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <button onClick={() => setUser({ user: { id: 'u1', email: 'a@b.c' }, tenant: { id: 't1', name: 'T' }, subscription: { status: 'trialing', plan: 'trial' } })}>login</button>
    </div>
  );
}

describe('SessionContext', () => {
  it('starts unauthenticated and flips on setUser', async () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId('auth').textContent).toBe('false');
    await userEvent.click(screen.getByText('login'));
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- contexts/SessionContext`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `contexts/SessionContext.tsx`**

```tsx
'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { tokenStore } from '@/lib/tokenStore';
import type { SessionUser } from '@/types/domain';
import type { AuthTokens } from '@/types/api';

interface SessionValue {
  user: SessionUser | null;
  isAuthenticated: boolean;
  setUser: (u: SessionUser | null) => void;
  setTokens: (t: AuthTokens) => void;
  clear: () => void;
}

const SessionCtx = createContext<SessionValue | null>(null);

export function SessionProvider({ children, initialUser = null }: { children: ReactNode; initialUser?: SessionUser | null }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const value = useMemo<SessionValue>(() => ({
    user,
    isAuthenticated: user !== null,
    setUser,
    setTokens: (t) => tokenStore.set(t),
    clear: () => { tokenStore.clear(); setUser(null); },
  }), [user]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSessionContext(): SessionValue {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSessionContext must be used within SessionProvider');
  return ctx;
}
```

- [ ] **Step 4: Update `test/utils/renderWithProviders.tsx` to wrap all providers**

```tsx
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactElement, type ReactNode } from 'react';
import { makeQueryClient } from '@/lib/queryClient';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SessionProvider } from '@/contexts/SessionContext';
import type { SessionUser } from '@/types/domain';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  user?: SessionUser | null;
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  const { user = null, ...rtlOptions } = options;
  const client = makeQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <LocaleProvider>
          <SessionProvider initialUser={user}>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </LocaleProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...rtlOptions });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- contexts/SessionContext && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contexts/SessionContext.tsx test/utils/renderWithProviders.tsx
git commit -m "feat: add SessionContext and finalize test provider harness"
```

---

### Task 8: StatusBadge + derivation logic (the single status display path)

**Files:**
- Create: `components/shared/statusBadge.logic.ts`, `components/shared/StatusBadge.tsx`
- Test: `components/shared/statusBadge.logic.spec.ts`, `components/shared/StatusBadge.spec.tsx`

**Interfaces:**
- Consumes: `PostSummary`, `PostStatus` (Task 3); `useLocale` (Task 2).
- Produces:
  - `type StatusBadgeKind = PostStatus | 'scheduled' | 'failed'`.
  - `deriveStatusKind(summary: Pick<PostSummary, 'status' | 'scheduledAt'>, failed?: boolean): StatusBadgeKind` — pure.
  - `StatusBadge(props: { status: StatusBadgeKind }): JSX.Element` — Arabic accessible name, token color, not color-only.

- [ ] **Step 1: Write failing tests**

`components/shared/statusBadge.logic.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveStatusKind } from './statusBadge.logic';

describe('deriveStatusKind', () => {
  it('approved with scheduledAt derives scheduled', () => {
    expect(deriveStatusKind({ status: 'approved', scheduledAt: '2026-07-01T10:00:00Z' })).toBe('scheduled');
  });
  it('approved without scheduledAt stays approved', () => {
    expect(deriveStatusKind({ status: 'approved', scheduledAt: null })).toBe('approved');
  });
  it('draft stays draft regardless of scheduledAt', () => {
    expect(deriveStatusKind({ status: 'draft', scheduledAt: '2026-07-01T10:00:00Z' })).toBe('draft');
  });
  it('failed flag overrides to failed', () => {
    expect(deriveStatusKind({ status: 'draft', scheduledAt: null }, true)).toBe('failed');
  });
  it('published stays published', () => {
    expect(deriveStatusKind({ status: 'published', scheduledAt: null })).toBe('published');
  });
});
```
`components/shared/StatusBadge.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders an arabic accessible name for scheduled (not color-only)', () => {
    renderWithProviders(<StatusBadge status="scheduled" />);
    expect(screen.getByText('مجدول')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName('مجدول');
  });
  it('renders failed status text', () => {
    renderWithProviders(<StatusBadge status="failed" />);
    expect(screen.getByText('فشل التوليد')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- statusBadge`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/shared/statusBadge.logic.ts`**

```ts
import type { PostStatus, PostSummary } from '@/types/domain';

export type StatusBadgeKind = PostStatus | 'scheduled' | 'failed';

// Pure derivation: backend never returns 'scheduled'/'failed' on Post.status.
// 'scheduled' = approved + scheduledAt present. 'failed' = month-plan generation failure flag.
export function deriveStatusKind(
  summary: Pick<PostSummary, 'status' | 'scheduledAt'>,
  failed = false,
): StatusBadgeKind {
  if (failed) return 'failed';
  if (summary.status === 'approved' && summary.scheduledAt) return 'scheduled';
  return summary.status;
}
```

- [ ] **Step 4: Implement `components/shared/StatusBadge.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import type { StatusBadgeKind } from './statusBadge.logic';

const TONE: Record<StatusBadgeKind, string> = {
  draft: 'bg-neutral text-neutral-fg',
  pending_review: 'bg-warning text-warning-fg',
  approved: 'bg-info text-info-fg',
  scheduled: 'bg-info text-info-fg',
  published: 'bg-success text-success-fg',
  failed: 'bg-danger text-danger-fg',
};

export function StatusBadge({ status }: { status: StatusBadgeKind }) {
  const { t } = useLocale();
  const label = t(`status.${status}`);
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${TONE[status]}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- statusBadge`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/shared/statusBadge.logic.ts components/shared/StatusBadge.tsx components/shared/statusBadge.logic.spec.ts components/shared/StatusBadge.spec.tsx
git commit -m "feat: add StatusBadge as single status display path with derivation logic"
```

---

### Task 9: CharCounter + weighted counting logic (twitter-text for X)

**Files:**
- Create: `lib/platformLimits.ts`, `components/shared/charCounter.logic.ts`, `components/shared/CharCounter.tsx`
- Test: `components/shared/charCounter.logic.spec.ts`, `components/shared/CharCounter.spec.tsx`

**Interfaces:**
- Consumes: `Platform` (Task 3); `useLocale`; `twitter-text`.
- Produces:
  - `PLATFORM_LIMITS: Record<Platform, { maxChars: number; premiumMaxChars?: number }>` — LinkedIn 3000, X 280 (premium 25000). (doc 15)
  - `countChars(value: string, platform: Platform): number` — X via `twitter-text` weighted length, LinkedIn via `.length`.
  - `counterZone(count: number, max: number): 'within' | 'near' | 'over'` — `near` at ≥90%.
  - `CharCounter(props: { value: string; platform: Platform; field?: 'post' }): JSX.Element`.

- [ ] **Step 1: Write failing tests**

`components/shared/charCounter.logic.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { countChars, counterZone } from './charCounter.logic';
import { PLATFORM_LIMITS } from '@/lib/platformLimits';

describe('platform limits', () => {
  it('linkedin cap is 3000, x cap is 280 with premium 25000', () => {
    expect(PLATFORM_LIMITS.linkedin.maxChars).toBe(3000);
    expect(PLATFORM_LIMITS.x.maxChars).toBe(280);
    expect(PLATFORM_LIMITS.x.premiumMaxChars).toBe(25000);
  });
});

describe('countChars', () => {
  it('linkedin counts plain length', () => {
    expect(countChars('hello', 'linkedin')).toBe(5);
  });
  it('x counts a wrapped url as 23 (twitter-text weighting)', () => {
    // any http url is t.co-wrapped to weight 23
    expect(countChars('https://example.com/some/very/long/path/that/exceeds/23', 'x')).toBe(23);
  });
  it('x weights ascii at 1 each', () => {
    expect(countChars('hello', 'x')).toBe(5);
  });
});

describe('counterZone', () => {
  it('within below 90 percent', () => {
    expect(counterZone(100, 280)).toBe('within');
  });
  it('near at 90 percent or above', () => {
    expect(counterZone(252, 280)).toBe('near');
  });
  it('over above max', () => {
    expect(counterZone(281, 280)).toBe('over');
  });
});
```
`components/shared/CharCounter.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { CharCounter } from './CharCounter';

describe('CharCounter', () => {
  it('shows count/max for x with weighted url counting', () => {
    renderWithProviders(<CharCounter value="https://example.com/very/long/url/here/exceeding" platform="x" />);
    // 23 weighted / 280
    expect(screen.getByText(/٢٣/)).toBeInTheDocument();
    expect(screen.getByText(/٢٨٠/)).toBeInTheDocument();
  });
  it('marks over-limit state for linkedin when value exceeds 3000', () => {
    const long = 'a'.repeat(3001);
    renderWithProviders(<CharCounter value={long} platform="linkedin" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-zone', 'over');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- charCounter CharCounter`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/platformLimits.ts`**

```ts
import type { Platform } from '@/types/domain';

// Visual-guidance limits mirrored from doc 15 (backend enforces the hard rule).
export interface PlatformCharLimit { maxChars: number; premiumMaxChars?: number; }

export const PLATFORM_LIMITS: Record<Platform, PlatformCharLimit> = {
  linkedin: { maxChars: 3000 },
  x: { maxChars: 280, premiumMaxChars: 25000 },
};
```

- [ ] **Step 4: Implement `components/shared/charCounter.logic.ts`**

```ts
import twitter from 'twitter-text';
import type { Platform } from '@/types/domain';
import { PLATFORM_LIMITS } from '@/lib/platformLimits';

// X uses twitter-text weighted counting (CJK/emoji weight 2, urls weight 23);
// LinkedIn uses plain .length. Visual guidance only — backend is the enforcer.
export function countChars(value: string, platform: Platform): number {
  if (platform === 'x') return twitter.parseTweet(value).weightedLength;
  return value.length;
}

export type CounterZone = 'within' | 'near' | 'over';

export function counterZone(count: number, max: number): CounterZone {
  if (count > max) return 'over';
  if (count >= max * 0.9) return 'near';
  return 'within';
}

export function maxFor(platform: Platform): number {
  return PLATFORM_LIMITS[platform].maxChars;
}
```

- [ ] **Step 5: Implement `components/shared/CharCounter.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import { formatNumber } from '@/lib/formatNumber';
import type { Platform } from '@/types/domain';
import { countChars, counterZone, maxFor } from './charCounter.logic';

const ZONE_CLASS = { within: 'text-muted', near: 'text-warning-fg', over: 'text-danger-fg' } as const;

export function CharCounter({ value, platform }: { value: string; platform: Platform; field?: 'post' }) {
  const { locale, t } = useLocale();
  const count = countChars(value, platform);
  const max = maxFor(platform);
  const zone = counterZone(count, max);
  const label = t(`charCounter.${zone}`);
  return (
    <span role="status" data-zone={zone} aria-label={label} className={`text-sm tabular-nums ${ZONE_CLASS[zone]}`}>
      {formatNumber(count, locale)} / {formatNumber(max, locale)}
    </span>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- charCounter CharCounter`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/platformLimits.ts components/shared/charCounter.logic.ts components/shared/CharCounter.tsx components/shared/charCounter.logic.spec.ts components/shared/CharCounter.spec.tsx
git commit -m "feat: add CharCounter with twitter-text weighted counting for X"
```

---

### Task 10: State components (Loading / Empty / Error) + DirectionalIcon

**Files:**
- Create: `components/shared/states/LoadingState.tsx`, `components/shared/states/EmptyState.tsx`, `components/shared/states/ErrorState.tsx`, `components/shared/DirectionalIcon.tsx`
- Test: `components/shared/states/states.spec.tsx`, `components/shared/DirectionalIcon.spec.tsx`

**Interfaces:**
- Consumes: `useLocale`; `ApiError` (Task 3).
- Produces:
  - `LoadingState(props: { label?: string }): JSX.Element` — skeleton, `role="status"`.
  - `EmptyState(props: { title: string; actionLabel?: string; onAction?: () => void }): JSX.Element`.
  - `ErrorState(props: { error?: ApiError | null; onRetry?: () => void }): JSX.Element` — Arabic message + retry, never a white screen.
  - `DirectionalIcon(props: { name: 'back' | 'forward' | 'send'; className?: string }): JSX.Element` — mirrors in RTL.

- [ ] **Step 1: Write failing tests**

`components/shared/states/states.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

describe('state components', () => {
  it('LoadingState exposes a status role', () => {
    renderWithProviders(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('EmptyState renders title and fires action', async () => {
    const onAction = vi.fn();
    renderWithProviders(<EmptyState title="لا بوستات بعد." actionLabel="ولّد أول بوست" onAction={onAction} />);
    expect(screen.getByText('لا بوستات بعد.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('ولّد أول بوست'));
    expect(onAction).toHaveBeenCalled();
  });
  it('ErrorState shows arabic message and retry', async () => {
    const onRetry = vi.fn();
    renderWithProviders(<ErrorState error={{ code: 'X', messageAr: 'تعذّر', status: 500 }} onRetry={onRetry} />);
    expect(screen.getByText('تعذّر')).toBeInTheDocument();
    await userEvent.click(screen.getByText('أعد المحاولة'));
    expect(onRetry).toHaveBeenCalled();
  });
  it('ErrorState falls back to generic arabic message when no messageAr', () => {
    renderWithProviders(<ErrorState error={{ code: 'X', messageAr: '', status: 500 }} />);
    expect(screen.getByText('حدث خطأ غير متوقّع.')).toBeInTheDocument();
  });
});
```
`components/shared/DirectionalIcon.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { DirectionalIcon } from './DirectionalIcon';

describe('DirectionalIcon', () => {
  it('mirrors in rtl via data-mirrored attribute', () => {
    renderWithProviders(<DirectionalIcon name="back" />);
    expect(screen.getByTestId('icon-back')).toHaveAttribute('data-mirrored', 'true');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- states DirectionalIcon`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement state components**

`components/shared/states/LoadingState.tsx`:
```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLocale();
  return (
    <div role="status" aria-label={label ?? t('common.loading')} className="animate-pulse space-y-3">
      <div className="h-4 w-2/3 rounded bg-neutral" />
      <div className="h-4 w-1/2 rounded bg-neutral" />
      <div className="h-24 w-full rounded bg-neutral" />
    </div>
  );
}
```
`components/shared/states/EmptyState.tsx`:
```tsx
'use client';
export function EmptyState({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface p-8 text-center">
      <p className="text-muted">{title}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="min-h-touch rounded-md bg-primary px-4 text-primary-fg">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```
`components/shared/states/ErrorState.tsx`:
```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import type { ApiError } from '@/types/api';

export function ErrorState({ error, onRetry }: { error?: ApiError | null; onRetry?: () => void }) {
  const { t } = useLocale();
  const message = error?.messageAr || t('common.genericError');
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-lg border border-danger bg-surface p-8 text-center">
      <p className="text-danger-fg">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="min-h-touch rounded-md bg-primary px-4 text-primary-fg">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/shared/DirectionalIcon.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';

const PATHS: Record<'back' | 'forward' | 'send', string> = {
  back: 'M15 18l-6-6 6-6',
  forward: 'M9 6l6 6-6 6',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
};

// Directional icons mirror in RTL; non-directional ones (search/settings) do not use this component.
export function DirectionalIcon({ name, className }: { name: 'back' | 'forward' | 'send'; className?: string }) {
  const { dir } = useLocale();
  const mirrored = dir === 'rtl';
  return (
    <svg
      data-testid={`icon-${name}`}
      data-mirrored={String(mirrored)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- states DirectionalIcon`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/shared/states components/shared/DirectionalIcon.tsx components/shared/DirectionalIcon.spec.tsx
git commit -m "feat: add loading/empty/error state components and DirectionalIcon"
```

---

### Task 11: PostCard + SourceList + ImagePreview

**Files:**
- Create: `components/shared/PostCard.tsx`, `components/shared/SourceList.tsx`, `components/shared/ImagePreview.tsx`
- Test: `components/shared/PostCard.spec.tsx`, `components/shared/SourceList.spec.tsx`, `components/shared/ImagePreview.spec.tsx`

**Interfaces:**
- Consumes: `PostSummary`, `Citation`, `Platform` (Task 3); `StatusBadge` + `deriveStatusKind` (Task 8); `useLocale`; `formatNumber`.
- Produces:
  - `PostCard(props: { post: PostSummary; onOpen?: (id: string) => void }): JSX.Element`.
  - `SourceList(props: { citations: Citation[] }): JSX.Element` — empty → renders nothing; links `rel="noopener noreferrer"` `target="_blank"`.
  - `ImagePreview(props: { url?: string; alt: string; platform: Platform }): JSX.Element` — loading/failed/absent states.

- [ ] **Step 1: Write failing tests**

`components/shared/PostCard.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { PostCard } from './PostCard';

describe('PostCard', () => {
  it('shows excerpt, platform, derived scheduled badge, and fires onOpen', async () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <PostCard
        post={{ id: 'p1', platform: 'linkedin', status: 'approved', scheduledAt: '2026-07-01T10:00:00Z', excerpt: 'مرحبا' }}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('مرحبا')).toBeInTheDocument();
    expect(screen.getByText('لينكدإن')).toBeInTheDocument();
    expect(screen.getByText('مجدول')).toBeInTheDocument(); // derived from approved + scheduledAt
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('p1');
  });
});
```
`components/shared/SourceList.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { SourceList } from './SourceList';

describe('SourceList', () => {
  it('renders nothing when there are no citations', () => {
    const { container } = renderWithProviders(<SourceList citations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('renders safe external links', () => {
    renderWithProviders(<SourceList citations={[{ claim: 'حقيقة', sourceUrl: 'https://example.com' }]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
```
`components/shared/ImagePreview.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { ImagePreview } from './ImagePreview';

describe('ImagePreview', () => {
  it('shows text-only placeholder when url is absent', () => {
    renderWithProviders(<ImagePreview alt="صورة البوست" platform="x" />);
    expect(screen.getByText('نص فقط (بدون صورة)')).toBeInTheDocument();
  });
  it('shows failure placeholder when the image errors', () => {
    renderWithProviders(<ImagePreview url="https://example.com/broken.png" alt="صورة البوست" platform="x" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('تعذّر تحميل الصورة.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- PostCard SourceList ImagePreview`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/shared/PostCard.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import type { PostSummary } from '@/types/domain';
import { StatusBadge } from './StatusBadge';
import { deriveStatusKind } from './statusBadge.logic';

export function PostCard({ post, onOpen }: { post: PostSummary; onOpen?: (id: string) => void }) {
  const { t } = useLocale();
  const kind = deriveStatusKind(post);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(post.id)}
      className="flex w-full min-h-touch flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-start"
    >
      {post.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.thumbnailUrl} alt="" className="h-32 w-full rounded object-cover" />
      )}
      <p className="line-clamp-3 text-text">{post.excerpt ?? ''}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{t(`platform.${post.platform}`)}</span>
        <StatusBadge status={kind} />
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Implement `components/shared/SourceList.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import type { Citation } from '@/types/domain';

export function SourceList({ citations }: { citations: Citation[] }) {
  const { t } = useLocale();
  if (citations.length === 0) return null;
  return (
    <section aria-label={t('editor.sources')} className="space-y-2">
      <h3 className="text-sm font-medium text-muted">{t('editor.sources')}</h3>
      <ul className="space-y-1">
        {citations.map((c, i) => (
          <li key={`${c.sourceUrl}-${i}`} className="text-sm">
            <span className="text-text">{c.claim} — </span>
            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-info-fg underline">
              {c.sourceUrl}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Implement `components/shared/ImagePreview.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import type { Platform } from '@/types/domain';

export function ImagePreview({ url, alt, platform }: { url?: string; alt: string; platform: Platform }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  if (!url) {
    return (
      <div data-platform={platform} className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-surface text-muted">
        {t('image.textOnly')}
      </div>
    );
  }
  return (
    <div data-platform={platform} className="relative w-full overflow-hidden rounded-lg bg-surface">
      {status === 'error' ? (
        <div className="flex aspect-square w-full items-center justify-center text-danger-fg">{t('image.failed')}</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
          className="w-full object-cover"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- PostCard SourceList ImagePreview`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/shared/PostCard.tsx components/shared/SourceList.tsx components/shared/ImagePreview.tsx components/shared/PostCard.spec.tsx components/shared/SourceList.spec.tsx components/shared/ImagePreview.spec.tsx
git commit -m "feat: add PostCard, SourceList, and ImagePreview shared components"
```

---

### Task 12: CalendarGrid (RTL grid desktop, vertical day list mobile)

**Files:**
- Create: `components/shared/CalendarGrid.tsx`
- Test: `components/shared/CalendarGrid.spec.tsx`

**Interfaces:**
- Consumes: `CalendarEntry`, `SaudiOccasion`, `CalendarPostSummary` (Task 3); `StatusBadge` + `deriveStatusKind` (Task 8); `useLocale`.
- Produces: `CalendarGrid(props: { month: string; entries: CalendarEntry[]; onOpenPost?: (id: string) => void; onReschedule?: (postId: string, date: string) => void }): JSX.Element`. Saudi week (Sat-first). Mobile renders a vertical day list with a date picker for reschedule (no drag); desktop renders the month grid.

- [ ] **Step 1: Write failing test**

`components/shared/CalendarGrid.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { CalendarGrid } from './CalendarGrid';
import type { CalendarEntry } from '@/types/domain';

const entries: CalendarEntry[] = [
  { type: 'occasion', date: '2026-07-04', occasion: { id: 'o1', tenantId: null, slug: 's', kind: 'commercial', nameAr: 'موسم', nameEn: 'Season', startDate: '2026-07-04', endDate: '2026-07-04', hijriYear: 1448, gregorianYear: 2026 } },
  { type: 'post', date: '2026-07-10', post: { id: 'p1', platform: 'x', status: 'approved', scheduledAt: '2026-07-10T09:00:00Z', excerpt: 'بوست', hasImage: false } },
];

describe('CalendarGrid', () => {
  it('renders occasion name and scheduled post badge', () => {
    renderWithProviders(<CalendarGrid month="2026-07" entries={entries} />);
    expect(screen.getByText('موسم')).toBeInTheDocument();
    expect(screen.getByText('بوست')).toBeInTheDocument();
    expect(screen.getByText('مجدول')).toBeInTheDocument(); // derived approved + scheduledAt
  });
  it('fires onOpenPost when a post entry is activated', async () => {
    const onOpenPost = vi.fn();
    renderWithProviders(<CalendarGrid month="2026-07" entries={entries} onOpenPost={onOpenPost} />);
    await userEvent.click(screen.getByText('بوست'));
    expect(onOpenPost).toHaveBeenCalledWith('p1');
  });
  it('reschedules a post via date picker (mobile alternative to drag)', async () => {
    const onReschedule = vi.fn();
    renderWithProviders(<CalendarGrid month="2026-07" entries={entries} onReschedule={onReschedule} />);
    const picker = screen.getByLabelText('اختر التاريخ');
    await userEvent.clear(picker);
    await userEvent.type(picker, '2026-07-15');
    expect(onReschedule).toHaveBeenCalledWith('p1', '2026-07-15');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CalendarGrid`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/shared/CalendarGrid.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import type { CalendarEntry } from '@/types/domain';
import { StatusBadge } from './StatusBadge';
import { deriveStatusKind } from './statusBadge.logic';

interface Props {
  month: string;
  entries: CalendarEntry[];
  onOpenPost?: (id: string) => void;
  onReschedule?: (postId: string, date: string) => void;
}

// Mobile-first: a vertical day list grouped by date. Posts carry a date picker for
// rescheduling (the mobile alternative to desktop drag/drop). Occasions are a background layer.
export function CalendarGrid({ month, entries, onOpenPost, onReschedule }: Props) {
  const { t, locale } = useLocale();
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const dates = Array.from(byDate.keys()).sort();
  const dateFmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div data-month={month} dir="rtl" className="space-y-4">
      {dates.map((date) => (
        <div key={date} className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium text-muted">{dateFmt.format(new Date(`${date}T00:00:00`))}</h3>
          <ul className="space-y-2">
            {byDate.get(date)!.map((e, i) => {
              if (e.type === 'occasion' && e.occasion) {
                return <li key={`o-${i}`} className="rounded bg-neutral px-3 py-1 text-sm text-neutral-fg">{e.occasion.nameAr}</li>;
              }
              if (e.type === 'post' && e.post) {
                const post = e.post;
                const kind = deriveStatusKind(post);
                return (
                  <li key={`p-${post.id}`} className="flex flex-col gap-2 rounded border border-border p-2">
                    <button type="button" onClick={() => onOpenPost?.(post.id)} className="min-h-touch text-start text-text">
                      {post.excerpt}
                    </button>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={kind} />
                      {onReschedule && (
                        <input
                          type="date"
                          aria-label={t('calendar.pickDate')}
                          defaultValue={date}
                          onChange={(ev) => onReschedule(post.id, ev.target.value)}
                          className="min-h-touch rounded border border-border px-2"
                        />
                      )}
                    </div>
                  </li>
                );
              }
              return null;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CalendarGrid`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/shared/CalendarGrid.tsx components/shared/CalendarGrid.spec.tsx
git commit -m "feat: add CalendarGrid with occasions layer and mobile reschedule picker"
```

---

### Task 13: services/ layer (all seven domains)

**Files:**
- Create: `services/auth.ts`, `services/brand.ts`, `services/content.ts`, `services/posts.ts`, `services/calendar.ts`, `services/export.ts`, `services/billing.ts`
- Test: `services/services.spec.ts`

**Interfaces:**
- Consumes: `apiClient` (Task 4); all DTOs/domain types (Task 3).
- Produces (thin contract wrappers — exact signatures below):
  - `authService`: `login(dto: LoginDto): Promise<AuthTokens>`; `register(dto: RegisterDto): Promise<AuthTokens>`; `me(): Promise<SessionUser>`; `listAccounts(): Promise<AccountProfile[]>`; `createAccount(dto: { brandProfileId: string; platform: Platform; handle?: string }): Promise<AccountProfile>`; `deleteAccount(id: string): Promise<void>`.
  - `brandService`: `analyze(input: OnboardingInput): Promise<BrandAnalysisResponse>`; `createProfile(req: CreateBrandProfileRequest): Promise<BrandProfile>`; `getProfile(id: string): Promise<BrandProfile>`; `patchProfile(id: string, patch: Partial<BrandProfileDraft>): Promise<BrandProfile>`.
  - `contentService`: `generateSinglePost(input: GenerationRequest): Promise<Post>`; `startMonthPlan(input: MonthPlanStartRequest): Promise<MonthPlanStartResponse>`; `getMonthPlanProgress(jobId: string): Promise<MonthPlanProgress>`.
  - `postsService`: `list(filters?: PostFilters): Promise<{ items: PostListItem[]; total: number; page: number; pageSize: number }>`; `get(id: string): Promise<Post>`; `patch(id: string, body: PatchPostRequest): Promise<Post>`; `approve(id: string): Promise<Post>`; `regenerate(id: string): Promise<Post>`.
  - `calendarService`: `getMonth(month: string): Promise<CalendarEntry[]>`; `reschedule(postId: string, date: string): Promise<Post>`.
  - `exportService`: `getAssets(postId: string, platform: Platform): Promise<ExportPayload>`; `markPublished(postId: string, body?: MarkPublishedRequest): Promise<MarkPublishedResult>`.
  - `billingService`: `getSubscription(): Promise<SubscriptionDisplay>`; `subscribe(req: SubscribeRequest): Promise<SubscribeResponse>`; `cancel(): Promise<void>`; `listInvoices(): Promise<Invoice[]>`.
- Provisional notes: month-plan polling, regenerate, and reschedule-shortcut endpoints are directional (doc 16 / Phase 4). `calendarService.getMonth` converts `month` (YYYY-MM) to `from`/`to` query params (first/last day).

- [ ] **Step 1: Write failing tests**

`services/services.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/apiClient';
import { authService } from './auth';
import { contentService } from './content';
import { postsService } from './posts';
import { calendarService } from './calendar';
import { exportService } from './export';
import { billingService } from './billing';
import { brandService } from './brand';

describe('services', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('authService.login posts to /auth/login', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ accessToken: 'a' } as never);
    await authService.login({ email: 'e@x.c', password: 'pw' });
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'e@x.c', password: 'pw' }, { skipAuth: true });
  });

  it('contentService.generateSinglePost posts to /posts/generate', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'p1' } as never);
    await contentService.generateSinglePost({ platform: 'x', contentType: 'thought' });
    expect(post).toHaveBeenCalledWith('/posts/generate', { platform: 'x', contentType: 'thought' });
  });

  it('contentService.getMonthPlanProgress gets job progress', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ jobId: 'j1', done: 1, total: 5, status: 'running' } as never);
    await contentService.getMonthPlanProgress('j1');
    expect(get).toHaveBeenCalledWith('/posts/month-plan/j1');
  });

  it('postsService.approve posts to approve endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'p1', status: 'approved' } as never);
    await postsService.approve('p1');
    expect(post).toHaveBeenCalledWith('/posts/p1/approve');
  });

  it('postsService.list builds query string from filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 } as never);
    await postsService.list({ status: 'draft', platform: 'x' });
    expect(get).toHaveBeenCalledWith('/posts?status=draft&platform=x');
  });

  it('calendarService.getMonth converts month to from/to range', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ entries: [] } as never);
    await calendarService.getMonth('2026-07');
    expect(get).toHaveBeenCalledWith('/calendar?from=2026-07-01&to=2026-07-31');
  });

  it('exportService.getAssets passes platform query', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ postId: 'p1' } as never);
    await exportService.getAssets('p1', 'linkedin');
    expect(get).toHaveBeenCalledWith('/posts/p1/export?platform=linkedin');
  });

  it('exportService.markPublished posts to mark-published', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ postId: 'p1', status: 'published' } as never);
    await exportService.markPublished('p1');
    expect(post).toHaveBeenCalledWith('/posts/p1/mark-published', {});
  });

  it('billingService.getSubscription gets subscription', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ status: 'active' } as never);
    await billingService.getSubscription();
    expect(get).toHaveBeenCalledWith('/billing/subscription');
  });

  it('brandService.analyze posts onboarding input', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ analysis: {}, questions: [] } as never);
    await brandService.analyze({ accounts: [], consentAccepted: true });
    expect(post).toHaveBeenCalledWith('/brand/analyze', { accounts: [], consentAccepted: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- services/services`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `services/auth.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { AuthTokens, LoginDto, RegisterDto } from '@/types/api';
import type { SessionUser, AccountProfile, Platform } from '@/types/domain';

export const authService = {
  login: (dto: LoginDto) => apiClient.post<AuthTokens>('/auth/login', dto, { skipAuth: true }),
  register: (dto: RegisterDto) => apiClient.post<AuthTokens>('/auth/register', dto, { skipAuth: true }),
  me: () => apiClient.get<SessionUser>('/me'),
  listAccounts: () => apiClient.get<AccountProfile[]>('/accounts'),
  createAccount: (dto: { brandProfileId: string; platform: Platform; handle?: string }) =>
    apiClient.post<AccountProfile>('/accounts', dto),
  deleteAccount: (id: string) => apiClient.del<void>(`/accounts/${id}`),
};
```

- [ ] **Step 4: Implement `services/brand.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { OnboardingInput, BrandAnalysisResponse, CreateBrandProfileRequest, BrandProfileDraft } from '@/types/api';
import type { BrandProfile } from '@/types/domain';

export const brandService = {
  analyze: (input: OnboardingInput) => apiClient.post<BrandAnalysisResponse>('/brand/analyze', input),
  createProfile: (req: CreateBrandProfileRequest) => apiClient.post<BrandProfile>('/brand/profile', req),
  getProfile: (id: string) => apiClient.get<BrandProfile>(`/brand/profile/${id}`),
  patchProfile: (id: string, patch: Partial<BrandProfileDraft>) => apiClient.patch<BrandProfile>(`/brand/profile/${id}`, patch),
};
```

- [ ] **Step 5: Implement `services/content.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { GenerationRequest, MonthPlanStartRequest, MonthPlanStartResponse, MonthPlanProgress } from '@/types/api';
import type { Post } from '@/types/domain';

export const contentService = {
  generateSinglePost: (input: GenerationRequest) => apiClient.post<Post>('/posts/generate', input),
  startMonthPlan: (input: MonthPlanStartRequest) => apiClient.post<MonthPlanStartResponse>('/posts/month-plan', input),
  getMonthPlanProgress: (jobId: string) => apiClient.get<MonthPlanProgress>(`/posts/month-plan/${jobId}`),
};
```

- [ ] **Step 6: Implement `services/posts.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { PatchPostRequest } from '@/types/api';
import type { Post, PostListItem } from '@/types/domain';
import type { PostFilters } from '@/lib/queryKeys';

export interface PostListResponse { items: PostListItem[]; total: number; page: number; pageSize: number; }

function toQuery(filters: PostFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.platform) params.set('platform', filters.platform);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export const postsService = {
  list: (filters: PostFilters = {}) => apiClient.get<PostListResponse>(`/posts${toQuery(filters)}`),
  get: (id: string) => apiClient.get<Post>(`/posts/${id}`),
  patch: (id: string, body: PatchPostRequest) => apiClient.patch<Post>(`/posts/${id}`, body),
  approve: (id: string) => apiClient.post<Post>(`/posts/${id}/approve`),
  regenerate: (id: string) => apiClient.post<Post>(`/posts/${id}/regenerate`),
};
```

- [ ] **Step 7: Implement `services/calendar.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { CalendarEntry, Post } from '@/types/domain';

interface CalendarResponse { entries: CalendarEntry[]; }

// month is YYYY-MM; the backend takes from/to ISO dates. Compute last day of month.
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export const calendarService = {
  getMonth: async (month: string) => {
    const { from, to } = monthRange(month);
    const res = await apiClient.get<CalendarResponse>(`/calendar?from=${from}&to=${to}`);
    return res.entries;
  },
  // Reschedule is a scheduledAt patch (Phase 4 PATCH /posts/:id). date is YYYY-MM-DD.
  reschedule: (postId: string, date: string) =>
    apiClient.patch<Post>(`/posts/${postId}`, { scheduledAt: `${date}T09:00:00Z` }),
};
```

- [ ] **Step 8: Implement `services/export.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { ExportPayload, MarkPublishedRequest, MarkPublishedResult } from '@/types/api';
import type { Platform } from '@/types/domain';

export const exportService = {
  getAssets: (postId: string, platform: Platform) =>
    apiClient.get<ExportPayload>(`/posts/${postId}/export?platform=${platform}`),
  markPublished: (postId: string, body: MarkPublishedRequest = {}) =>
    apiClient.post<MarkPublishedResult>(`/posts/${postId}/mark-published`, body),
};
```

- [ ] **Step 9: Implement `services/billing.ts`**

```ts
import { apiClient } from '@/lib/apiClient';
import type { SubscribeRequest, SubscribeResponse } from '@/types/api';
import type { SubscriptionDisplay, Invoice } from '@/types/domain';

export const billingService = {
  getSubscription: () => apiClient.get<SubscriptionDisplay>('/billing/subscription'),
  subscribe: (req: SubscribeRequest) => apiClient.post<SubscribeResponse>('/billing/subscribe', req),
  cancel: () => apiClient.post<void>('/billing/cancel'),
  listInvoices: () => apiClient.get<Invoice[]>('/billing/invoices'),
};
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test -- services/services && npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add services
git commit -m "feat: add services layer wrapping all seven backend domains"
```

---

### Task 14: hooks/ layer (server-state wrappers with keyed invalidation)

**Files:**
- Create: `hooks/useAuth.ts`, `hooks/useSession.ts`, `hooks/useBrandProfile.ts`, `hooks/useBrandAnalysis.ts`, `hooks/useGeneration.ts`, `hooks/useMonthPlan.ts`, `hooks/usePosts.ts`, `hooks/usePost.ts`, `hooks/useApprovePost.ts`, `hooks/useCalendar.ts`, `hooks/useReschedule.ts`, `hooks/useExportAssets.ts`, `hooks/useMarkPublished.ts`, `hooks/useBilling.ts`, `hooks/useInvoices.ts`
- Test: `hooks/hooks.spec.tsx`

**Interfaces:**
- Consumes: all services (Task 13); `queryKeys` (Task 5); `SessionContext` (Task 7); `useToast` (Task 6); `useLocale`; TanStack Query.
- Produces:
  - `usePosts(filters?: PostFilters)` → `useQuery<PostListResponse>` keyed `queryKeys.posts(filters)`.
  - `usePost(id: string)` → `useQuery<Post>` keyed `queryKeys.post(id)`.
  - `useApprovePost()` → `useMutation` (approve) invalidating `posts` + `post:id` + `calendar`.
  - `useGeneration()` → `useMutation<Post, ApiError, GenerationRequest>` (single post).
  - `useMonthPlan()` → `{ start: (count) => void; jobId: string | null; progress: MonthPlanProgress | undefined; isPolling: boolean }` polling `getMonthPlanProgress` every 2s until `status !== 'running'`.
  - `useCalendar(month: string)` → `useQuery<CalendarEntry[]>` keyed `queryKeys.calendar(month)`.
  - `useReschedule()` → `useMutation` invalidating `calendar` + `posts`.
  - `useExportAssets(postId, platform)` → `useQuery<ExportPayload>`.
  - `useMarkPublished()` → `useMutation` invalidating `post:id` + `posts` + `calendar`.
  - `useBilling()` → `useQuery<SubscriptionDisplay>` keyed `queryKeys.billing()`.
  - `useInvoices()` → `useQuery<Invoice[]>` keyed `queryKeys.invoices()`.
  - `useBrandProfile(id?)` → `useQuery<BrandProfile>` (enabled when id present).
  - `useBrandAnalysis()` → `useMutation<BrandAnalysisResponse, ApiError, OnboardingInput>`.
  - `useAuth()` → `{ login, register, logout }` — login/register call service, store tokens, fetch `me`, set session, route.
  - `useSession()` → re-exports `useSessionContext`.

- [ ] **Step 1: Write failing tests**

`hooks/hooks.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { makeQueryClient } from '@/lib/queryClient';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { postsService } from '@/services/posts';
import { contentService } from '@/services/content';
import { usePosts } from './usePosts';
import { useApprovePost } from './useApprovePost';
import { useMonthPlan } from './useMonthPlan';

function wrapper({ children }: { children: ReactNode }) {
  const client = makeQueryClient();
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider><SessionProvider><ToastProvider>{children}</ToastProvider></SessionProvider></LocaleProvider>
    </QueryClientProvider>
  );
}

describe('hooks', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('usePosts fetches the list', async () => {
    vi.spyOn(postsService, 'list').mockResolvedValue({ items: [{ id: 'p1', platform: 'x', status: 'draft', scheduledAt: null, text: 'hi', hashtags: [], hasImage: false, citationCount: 0 }], total: 1, page: 1, pageSize: 20 });
    const { result } = renderHook(() => usePosts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('useApprovePost calls approve service', async () => {
    const approve = vi.spyOn(postsService, 'approve').mockResolvedValue({ id: 'p1', status: 'approved' } as never);
    const { result } = renderHook(() => useApprovePost(), { wrapper });
    await act(async () => { await result.current.mutateAsync('p1'); });
    expect(approve).toHaveBeenCalledWith('p1');
  });

  it('useMonthPlan polls progress until completed', async () => {
    vi.spyOn(contentService, 'startMonthPlan').mockResolvedValue({ jobId: 'j1' });
    const progress = vi.spyOn(contentService, 'getMonthPlanProgress')
      .mockResolvedValueOnce({ jobId: 'j1', done: 1, total: 2, status: 'running' })
      .mockResolvedValue({ jobId: 'j1', done: 2, total: 2, status: 'completed' });
    const { result } = renderHook(() => useMonthPlan(), { wrapper });
    await act(async () => { result.current.start(2); });
    await waitFor(() => expect(result.current.progress?.status).toBe('completed'), { timeout: 5000 });
    expect(progress).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- hooks/hooks`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement query hooks**

`hooks/usePosts.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { postsService, type PostListResponse } from '@/services/posts';
import { queryKeys, type PostFilters } from '@/lib/queryKeys';

export function usePosts(filters: PostFilters = {}) {
  return useQuery<PostListResponse>({ queryKey: queryKeys.posts(filters), queryFn: () => postsService.list(filters) });
}
```
`hooks/usePost.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { postsService } from '@/services/posts';
import { queryKeys } from '@/lib/queryKeys';
import type { Post } from '@/types/domain';

export function usePost(id: string) {
  return useQuery<Post>({ queryKey: queryKeys.post(id), queryFn: () => postsService.get(id), enabled: !!id });
}
```
`hooks/useCalendar.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { calendarService } from '@/services/calendar';
import { queryKeys } from '@/lib/queryKeys';
import type { CalendarEntry } from '@/types/domain';

export function useCalendar(month: string) {
  return useQuery<CalendarEntry[]>({ queryKey: queryKeys.calendar(month), queryFn: () => calendarService.getMonth(month), enabled: !!month });
}
```
`hooks/useBilling.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { billingService } from '@/services/billing';
import { queryKeys } from '@/lib/queryKeys';
import type { SubscriptionDisplay } from '@/types/domain';

export function useBilling() {
  return useQuery<SubscriptionDisplay>({ queryKey: queryKeys.billing(), queryFn: () => billingService.getSubscription() });
}
```
`hooks/useInvoices.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { billingService } from '@/services/billing';
import { queryKeys } from '@/lib/queryKeys';
import type { Invoice } from '@/types/domain';

export function useInvoices() {
  return useQuery<Invoice[]>({ queryKey: queryKeys.invoices(), queryFn: () => billingService.listInvoices() });
}
```
`hooks/useBrandProfile.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { brandService } from '@/services/brand';
import { queryKeys } from '@/lib/queryKeys';
import type { BrandProfile } from '@/types/domain';

export function useBrandProfile(id?: string) {
  return useQuery<BrandProfile>({ queryKey: queryKeys.brandProfile(id ?? ''), queryFn: () => brandService.getProfile(id!), enabled: !!id });
}
```
`hooks/useExportAssets.ts`:
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { exportService } from '@/services/export';
import type { ExportPayload } from '@/types/api';
import type { Platform } from '@/types/domain';

export function useExportAssets(postId: string, platform: Platform) {
  return useQuery<ExportPayload>({
    queryKey: ['export', postId, platform],
    queryFn: () => exportService.getAssets(postId, platform),
    enabled: !!postId,
  });
}
```

- [ ] **Step 4: Implement mutation hooks**

`hooks/useApprovePost.ts`:
```ts
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postsService } from '@/services/posts';
import { queryKeys } from '@/lib/queryKeys';
import type { Post } from '@/types/domain';
import type { ApiError } from '@/types/api';

export function useApprovePost() {
  const qc = useQueryClient();
  return useMutation<Post, ApiError, string>({
    mutationFn: (id) => postsService.approve(id),
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: queryKeys.post(post.id) });
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
```
`hooks/useGeneration.ts`:
```ts
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contentService } from '@/services/content';
import type { GenerationRequest } from '@/types/api';
import type { Post } from '@/types/domain';
import type { ApiError } from '@/types/api';

export function useGeneration() {
  const qc = useQueryClient();
  return useMutation<Post, ApiError, GenerationRequest>({
    mutationFn: (input) => contentService.generateSinglePost(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}
```
`hooks/useReschedule.ts`:
```ts
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarService } from '@/services/calendar';
import type { Post } from '@/types/domain';
import type { ApiError } from '@/types/api';

export function useReschedule() {
  const qc = useQueryClient();
  return useMutation<Post, ApiError, { postId: string; date: string }>({
    mutationFn: ({ postId, date }) => calendarService.reschedule(postId, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
```
`hooks/useMarkPublished.ts`:
```ts
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { exportService } from '@/services/export';
import { queryKeys } from '@/lib/queryKeys';
import type { MarkPublishedResult } from '@/types/api';
import type { ApiError } from '@/types/api';

export function useMarkPublished() {
  const qc = useQueryClient();
  return useMutation<MarkPublishedResult, ApiError, string>({
    mutationFn: (postId) => exportService.markPublished(postId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.post(res.postId) });
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}
```
`hooks/useBrandAnalysis.ts`:
```ts
'use client';
import { useMutation } from '@tanstack/react-query';
import { brandService } from '@/services/brand';
import type { OnboardingInput, BrandAnalysisResponse, ApiError } from '@/types/api';

export function useBrandAnalysis() {
  return useMutation<BrandAnalysisResponse, ApiError, OnboardingInput>({
    mutationFn: (input) => brandService.analyze(input),
  });
}
```

- [ ] **Step 5: Implement `hooks/useMonthPlan.ts` (async progress polling)**

```ts
'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { contentService } from '@/services/content';
import { queryKeys } from '@/lib/queryKeys';
import type { MonthPlanProgress, ApiError } from '@/types/api';

export function useMonthPlan() {
  const [jobId, setJobId] = useState<string | null>(null);

  const startMutation = useMutation<{ jobId: string }, ApiError, number>({
    mutationFn: (count) => contentService.startMonthPlan({ count }),
    onSuccess: (res) => setJobId(res.jobId),
  });

  // Polls every 2s while the job is running; survives navigation via server-state cache key.
  const progressQuery = useQuery<MonthPlanProgress>({
    queryKey: jobId ? queryKeys.monthPlan(jobId) : ['monthPlan', 'idle'],
    queryFn: () => contentService.getMonthPlanProgress(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'running' ? false : 2000),
  });

  return {
    start: (count: number) => startMutation.mutate(count),
    jobId,
    progress: progressQuery.data,
    isPolling: !!jobId && progressQuery.data?.status === 'running',
    isStarting: startMutation.isPending,
    error: startMutation.error ?? null,
  };
}
```

- [ ] **Step 6: Implement `hooks/useSession.ts` and `hooks/useAuth.ts`**

`hooks/useSession.ts`:
```ts
'use client';
export { useSessionContext as useSession } from '@/contexts/SessionContext';
```
`hooks/useAuth.ts`:
```ts
'use client';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { authService } from '@/services/auth';
import { useSessionContext } from '@/contexts/SessionContext';
import type { LoginDto, RegisterDto, ApiError } from '@/types/api';
import type { SessionUser } from '@/types/domain';

export function useAuth() {
  const router = useRouter();
  const { setUser, setTokens, clear } = useSessionContext();

  const routeAfterAuth = (me: SessionUser) => {
    setUser(me);
    router.push(me.hasBrandProfile ? '/dashboard' : '/onboarding');
  };

  const login = useMutation<SessionUser, ApiError, LoginDto>({
    mutationFn: async (dto) => {
      const tokens = await authService.login(dto);
      setTokens(tokens);
      return authService.me();
    },
    onSuccess: routeAfterAuth,
  });

  const register = useMutation<SessionUser, ApiError, RegisterDto>({
    mutationFn: async (dto) => {
      const tokens = await authService.register(dto);
      setTokens(tokens);
      return authService.me();
    },
    onSuccess: () => router.push('/onboarding'),
  });

  const logout = () => { clear(); router.push('/login'); };

  return { login, register, logout };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- hooks/hooks && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add hooks
git commit -m "feat: add hooks layer with server-state queries, mutations, and month-plan polling"
```

---

### Task 15: Root layout + AppProviders + dir/lang + IBM Plex Sans Arabic font

**Files:**
- Create: `app/layout.tsx`, `app/AppProviders.tsx`, `app/not-found.tsx`
- Test: `app/AppProviders.spec.tsx`

**Interfaces:**
- Consumes: `LocaleProvider`, `SessionProvider`, `ToastProvider` (Tasks 2/6/7); `makeQueryClient` (Task 5); `setAuthFailureHandler` (Task 4).
- Produces:
  - `AppProviders({ children }): JSX.Element` — wraps QueryClient + Locale + Session + Toast; wires `setAuthFailureHandler` to navigate to `/login?next=<intendedPath>`.
  - Root `RootLayout` sets `<html lang="ar" dir="rtl">` and applies the IBM Plex Sans Arabic `next/font` variable.

- [ ] **Step 1: Write failing test**

`app/AppProviders.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProviders } from './AppProviders';
import { useLocale } from '@/contexts/LocaleContext';

function Probe() {
  const { dir } = useLocale();
  return <span data-testid="dir">{dir}</span>;
}

describe('AppProviders', () => {
  it('provides locale defaulting to rtl', () => {
    render(<AppProviders><Probe /></AppProviders>);
    expect(screen.getByTestId('dir').textContent).toBe('rtl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/AppProviders`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/AppProviders.tsx`**

```tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { makeQueryClient } from '@/lib/queryClient';
import { setAuthFailureHandler } from '@/lib/apiClient';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { ToastProvider } from '@/contexts/ToastContext';

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  const router = useRouter();

  useEffect(() => {
    // Gentle logout: on unrecoverable 401, redirect to login preserving the intended path.
    setAuthFailureHandler((intendedPath) => {
      router.push(`/login?next=${encodeURIComponent(intendedPath)}`);
    });
  }, [router]);

  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Implement `app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { AppProviders } from './AppProviders';
import './globals.css';

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const metadata = { title: 'أثر', description: 'منصّة محتوى عربية' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={plexArabic.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Implement `app/not-found.tsx`**

```tsx
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <p className="text-muted">٤٠٤</p>
    </main>
  );
}
```

- [ ] **Step 6: Run test + typecheck + build**

Run: `npm test -- app/AppProviders && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/AppProviders.tsx app/not-found.tsx app/AppProviders.spec.tsx
git commit -m "feat: add root layout with rtl/ar, plex arabic font, and providers"
```

---

### Task 16: AuthGuard + AppShell (BottomNav / SideNav / Header) + route group layouts

**Files:**
- Create: `components/layout/AuthGuard.tsx`, `components/layout/AppShell.tsx`, `components/layout/BottomNav.tsx`, `components/layout/SideNav.tsx`, `components/layout/Header.tsx`
- Create: `app/(auth)/layout.tsx`, `app/(app)/layout.tsx`
- Test: `components/layout/AuthGuard.spec.tsx`, `components/layout/AppShell.spec.tsx`

**Interfaces:**
- Consumes: `useSessionContext` (Task 7); `tokenStore` (Task 4); `authService.me` (Task 13); `useLocale`; `next/navigation`.
- Produces:
  - `AuthGuard({ children }): JSX.Element` — if no token and no user, redirect to `/login?next=<path>`; while bootstrapping the session (token present, user null), fetch `me`; renders `LoadingState` during bootstrap.
  - `AppShell({ children }): JSX.Element` — `Header` + `BottomNav` (mobile) / `SideNav` (≥md) + content; nav items from i18n.
  - `(auth)/layout.tsx` — bare centered layout.
  - `(app)/layout.tsx` — `AuthGuard` wrapping `AppShell`.

- [ ] **Step 1: Write failing tests**

`components/layout/AuthGuard.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { tokenStore } from '@/lib/tokenStore';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard',
}));

import { AuthGuard } from './AuthGuard';

describe('AuthGuard', () => {
  beforeEach(() => { tokenStore.clear(); pushMock.mockClear(); });

  it('redirects to login when unauthenticated and no token', async () => {
    renderWithProviders(<AuthGuard><div>secret</div></AuthGuard>, { user: null });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fdashboard'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children when a user is present', () => {
    renderWithProviders(<AuthGuard><div>secret</div></AuthGuard>, {
      user: { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' } },
    });
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});
```
`components/layout/AppShell.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/dashboard' }));
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders nav landmarks and content', () => {
    renderWithProviders(<AppShell><div>content</div></AppShell>);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('اللوحة').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/layout`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/layout/AuthGuard.tsx`**

```tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSessionContext } from '@/contexts/SessionContext';
import { tokenStore } from '@/lib/tokenStore';
import { authService } from '@/services/auth';
import { LoadingState } from '@/components/shared/states/LoadingState';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, setUser } = useSessionContext();
  const router = useRouter();
  const pathname = usePathname();
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    if (user) return;
    const hasToken = !!tokenStore.getAccess();
    if (!hasToken) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBootstrapping(true);
    authService.me()
      .then((me) => setUser(me))
      .catch(() => router.push(`/login?next=${encodeURIComponent(pathname)}`))
      .finally(() => setBootstrapping(false));
  }, [user, router, pathname, setUser]);

  if (user) return <>{children}</>;
  if (bootstrapping) return <LoadingState />;
  return null;
}
```

- [ ] **Step 4: Implement nav components**

`components/layout/Header.tsx`:
```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';

export function Header() {
  const { t } = useLocale();
  return (
    <header className="flex h-touch items-center border-b border-border bg-surface px-4">
      <span className="font-semibold text-text">{t('common.appName')}</span>
    </header>
  );
}
```
`components/layout/BottomNav.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';

const ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/posts', key: 'nav.posts' },
  { href: '/generate', key: 'nav.generate' },
  { href: '/calendar', key: 'nav.calendar' },
  { href: '/settings', key: 'nav.settings' },
] as const;

export function BottomNav() {
  const { t } = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t('nav.dashboard')} className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          className={`flex min-h-touch flex-1 items-center justify-center py-2 text-sm ${pathname.startsWith(item.href) ? 'text-primary' : 'text-muted'}`}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
```
`components/layout/SideNav.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';

const ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/posts', key: 'nav.posts' },
  { href: '/generate', key: 'nav.generate' },
  { href: '/calendar', key: 'nav.calendar' },
  { href: '/billing', key: 'nav.billing' },
  { href: '/settings', key: 'nav.settings' },
] as const;

export function SideNav() {
  const { t } = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t('nav.settings')} className="hidden w-56 shrink-0 border-e border-border bg-surface p-4 md:block">
      <ul className="space-y-1">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              className={`block min-h-touch rounded px-3 py-2 ${pathname.startsWith(item.href) ? 'bg-neutral text-primary' : 'text-muted'}`}
            >
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```
`components/layout/AppShell.tsx`:
```tsx
'use client';
import type { ReactNode } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { SideNav } from './SideNav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <SideNav />
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 5: Implement route-group layouts**

`app/(auth)/layout.tsx`:
```tsx
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">{children}</main>;
}
```
`app/(app)/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AppShell } from '@/components/layout/AppShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- components/layout && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/layout "app/(auth)/layout.tsx" "app/(app)/layout.tsx"
git commit -m "feat: add AuthGuard, AppShell, nav, and route-group layouts"
```

---

### Task 17: Login + Register screens (#1, #2)

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`
- Test: `app/(auth)/login/login.spec.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 14); `useLocale`; `isApiError`; `next/navigation`.
- Produces: login + register pages with field validation, submit loading state, cross-links, Arabic error messages.

- [ ] **Step 1: Write failing test**

`app/(auth)/login/login.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

const mutateAsync = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: { mutateAsync, isPending: false, error: null },
    register: { mutateAsync: vi.fn(), isPending: false, error: null },
    logout: vi.fn(),
  }),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => mutateAsync.mockReset());

  it('validates empty fields before submit', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'دخول' }));
    expect(screen.getAllByText('هذا الحقل مطلوب.').length).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('submits valid credentials', async () => {
    mutateAsync.mockResolvedValue(undefined);
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('كلمة المرور'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'دخول' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password1' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- login`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/(auth)/login/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { isApiError } from '@/lib/apiClient';

export default function LoginPage() {
  const { t } = useLocale();
  const { show } = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!email) e.email = t('auth.required');
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = t('auth.emailInvalid');
    if (!password) e.password = t('auth.required');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    try {
      await login.mutateAsync({ email, password });
    } catch (err) {
      show(isApiError(err) ? err.messageAr || t('auth.invalidCredentials') : t('common.genericError'), 'error');
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">{t('auth.loginTitle')}</h1>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm">{t('auth.email')}</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined}
          className="min-h-touch w-full rounded border border-border bg-surface px-3" />
        {errors.email && <p id="email-err" className="text-sm text-danger-fg">{errors.email}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm">{t('auth.password')}</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-err' : undefined}
          className="min-h-touch w-full rounded border border-border bg-surface px-3" />
        {errors.password && <p id="password-err" className="text-sm text-danger-fg">{errors.password}</p>}
      </div>
      <button type="submit" disabled={login.isPending}
        className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg disabled:opacity-60">
        {login.isPending ? t('common.loading') : t('auth.submitLogin')}
      </button>
      <Link href="/register" className="block text-center text-sm text-info-fg">{t('auth.toRegister')}</Link>
    </form>
  );
}
```

- [ ] **Step 4: Implement `app/(auth)/register/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { isApiError } from '@/lib/apiClient';

export default function RegisterPage() {
  const { t } = useLocale();
  const { show } = useToast();
  const { register } = useAuth();
  const [tenantName, setTenantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ tenantName?: string; email?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!tenantName) e.tenantName = t('auth.required');
    if (!email) e.email = t('auth.required');
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = t('auth.emailInvalid');
    if (!password) e.password = t('auth.required');
    else if (password.length < 8) e.password = t('auth.passwordShort');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    try {
      await register.mutateAsync({ tenantName, email, password });
    } catch (err) {
      const code = isApiError(err) ? err.code : '';
      show(code === 'EMAIL_ALREADY_EXISTS' ? t('auth.emailExists') : t('common.genericError'), 'error');
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">{t('auth.registerTitle')}</h1>
      <div className="space-y-1">
        <label htmlFor="tenantName" className="block text-sm">{t('auth.tenantName')}</label>
        <input id="tenantName" value={tenantName} onChange={(e) => setTenantName(e.target.value)}
          aria-invalid={!!errors.tenantName} aria-describedby={errors.tenantName ? 'tenant-err' : undefined}
          className="min-h-touch w-full rounded border border-border bg-surface px-3" />
        {errors.tenantName && <p id="tenant-err" className="text-sm text-danger-fg">{errors.tenantName}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm">{t('auth.email')}</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined}
          className="min-h-touch w-full rounded border border-border bg-surface px-3" />
        {errors.email && <p id="email-err" className="text-sm text-danger-fg">{errors.email}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm">{t('auth.password')}</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-err' : undefined}
          className="min-h-touch w-full rounded border border-border bg-surface px-3" />
        {errors.password && <p id="password-err" className="text-sm text-danger-fg">{errors.password}</p>}
      </div>
      <button type="submit" disabled={register.isPending}
        className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg disabled:opacity-60">
        {register.isPending ? t('common.loading') : t('auth.submitRegister')}
      </button>
      <Link href="/login" className="block text-center text-sm text-info-fg">{t('auth.toLogin')}</Link>
    </form>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- login`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/login" "app/(auth)/register"
git commit -m "feat: add login and register screens with validation and arabic errors"
```

---

### Task 18: Onboarding wizard screen (#3)

**Files:**
- Create: `app/(app)/onboarding/page.tsx`
- Test: `app/(app)/onboarding/onboarding.spec.tsx`

**Interfaces:**
- Consumes: `useBrandAnalysis` (Task 14); `brandService.createProfile` (Task 13); `useSessionContext`; `useLocale`; `useToast`; `next/navigation`; state components.
- Produces: a 5-step wizard (input → analysis → confirmation questions → topics/prohibitions → review/approve). Wizard progress persisted to `sessionStorage` so exit/return resumes the last step. On approve → `createProfile` → set `hasBrandProfile` → route `/dashboard`.

- [ ] **Step 1: Write failing test**

`app/(app)/onboarding/onboarding.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const analyzeAsync = vi.fn();
vi.mock('@/hooks/useBrandAnalysis', () => ({
  useBrandAnalysis: () => ({ mutateAsync: analyzeAsync, isPending: false, error: null }),
}));
const createProfile = vi.fn();
vi.mock('@/services/brand', () => ({ brandService: { createProfile: (...a: unknown[]) => createProfile(...a) } }));

import OnboardingPage from './page';

describe('OnboardingPage', () => {
  beforeEach(() => { pushMock.mockClear(); analyzeAsync.mockReset(); createProfile.mockReset(); sessionStorage.clear(); });

  it('runs analysis on the input step then advances to analysis view', async () => {
    analyzeAsync.mockResolvedValue({
      analysis: { source: 'manual', tone: 'ودّي', products: [], audience: 'رواد أعمال', keywords: [], suggestedTopics: ['ريادة'], suggestedCompetitors: [], confidence: 0.5, notes: [] },
      questions: [],
    });
    renderWithProviders(<OnboardingPage />);
    await userEvent.click(screen.getByLabelText(/أوافق/));
    await userEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => expect(analyzeAsync).toHaveBeenCalled());
    expect(screen.getByText('ريادة')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onboarding`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/(app)/onboarding/page.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useBrandAnalysis } from '@/hooks/useBrandAnalysis';
import { brandService } from '@/services/brand';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { isApiError } from '@/lib/apiClient';
import type { BrandAnalysisResult } from '@/types/api';

type Step = 0 | 1 | 2 | 3 | 4;
const STORAGE_KEY = 'onboarding-progress';

export default function OnboardingPage() {
  const { t } = useLocale();
  const { show } = useToast();
  const router = useRouter();
  const { user, setUser } = useSessionContext();
  const analysis = useBrandAnalysis();

  const [step, setStep] = useState<Step>(0);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<BrandAnalysisResult | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [prohibitions, setProhibitions] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newProhibition, setNewProhibition] = useState('');
  const [saving, setSaving] = useState(false);

  // Resume from last step on return.
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { step: Step; websiteUrl: string; topics: string[]; prohibitions: string[] };
      setStep(s.step); setWebsiteUrl(s.websiteUrl); setTopics(s.topics); setProhibitions(s.prohibitions);
    }
  }, []);
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, websiteUrl, topics, prohibitions }));
  }, [step, websiteUrl, topics, prohibitions]);

  const runAnalysis = async () => {
    try {
      const res = await analysis.mutateAsync({ websiteUrl: websiteUrl || undefined, accounts: [], consentAccepted: consent });
      setResult(res.analysis);
      setTopics(res.analysis.suggestedTopics);
      setStep(1);
    } catch (err) {
      show(isApiError(err) ? err.messageAr || t('common.genericError') : t('common.genericError'), 'error');
    }
  };

  const finish = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await brandService.createProfile({
        draft: {
          tone: result.tone, audience: result.audience, goals: '', topics,
          prohibitions, competitors: result.suggestedCompetitors, keywords: result.keywords,
          brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
        },
        accounts: [],
      });
      if (user) setUser({ ...user, hasBrandProfile: true });
      sessionStorage.removeItem(STORAGE_KEY);
      router.push('/dashboard');
    } catch (err) {
      show(isApiError(err) ? err.messageAr || t('common.genericError') : t('common.genericError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">{t('onboarding.title')}</h1>

      {step === 0 && (
        <section className="space-y-4">
          <h2 className="text-sm text-muted">{t('onboarding.stepInput')}</h2>
          <div className="space-y-1">
            <label htmlFor="website" className="block text-sm">{t('onboarding.websiteUrl')}</label>
            <input id="website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
              className="min-h-touch w-full rounded border border-border bg-surface px-3" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-5" />
            <span className="text-sm">{t('onboarding.consent')}</span>
          </label>
          <button type="button" disabled={!consent || analysis.isPending} onClick={runAnalysis}
            className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg disabled:opacity-60">
            {t('common.next')}
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="text-sm text-muted">{t('onboarding.stepAnalysis')}</h2>
          {analysis.isPending ? <LoadingState label={t('onboarding.analyzing')} /> : (
            <>
              <p className="text-text">{result?.tone}</p>
              <ul className="flex flex-wrap gap-2">
                {result?.suggestedTopics.map((s) => <li key={s} className="rounded bg-neutral px-3 py-1 text-sm">{s}</li>)}
              </ul>
              <button type="button" onClick={() => setStep(2)} className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg">{t('common.next')}</button>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-sm text-muted">{t('onboarding.stepQuestions')}</h2>
          <p className="text-text">{result?.audience}</p>
          <button type="button" onClick={() => setStep(3)} className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg">{t('common.next')}</button>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="text-sm text-muted">{t('onboarding.stepTopics')}</h2>
          <div className="space-y-2">
            <span className="text-sm text-muted">{t('onboarding.suggestedTopics')}</span>
            <ul className="flex flex-wrap gap-2">
              {topics.map((tp) => (
                <li key={tp} className="flex items-center gap-1 rounded bg-neutral px-2 py-1 text-sm">
                  {tp}
                  <button type="button" aria-label={t('settings.remove')} onClick={() => setTopics(topics.filter((x) => x !== tp))}>×</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} className="min-h-touch flex-1 rounded border border-border px-3" />
              <button type="button" onClick={() => { if (newTopic) { setTopics([...topics, newTopic]); setNewTopic(''); } }}
                className="min-h-touch rounded bg-neutral px-3">{t('onboarding.addTopic')}</button>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-sm text-muted">{t('onboarding.prohibitions')}</span>
            <ul className="flex flex-wrap gap-2">
              {prohibitions.map((p) => (
                <li key={p} className="flex items-center gap-1 rounded bg-danger px-2 py-1 text-sm text-danger-fg">
                  {p}
                  <button type="button" aria-label={t('settings.remove')} onClick={() => setProhibitions(prohibitions.filter((x) => x !== p))}>×</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input value={newProhibition} onChange={(e) => setNewProhibition(e.target.value)} className="min-h-touch flex-1 rounded border border-border px-3" />
              <button type="button" onClick={() => { if (newProhibition) { setProhibitions([...prohibitions, newProhibition]); setNewProhibition(''); } }}
                className="min-h-touch rounded bg-neutral px-3">{t('onboarding.addProhibition')}</button>
            </div>
          </div>
          <button type="button" onClick={() => setStep(4)} className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg">{t('common.next')}</button>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <h2 className="text-sm text-muted">{t('onboarding.stepReview')}</h2>
          <p className="text-text">{result?.tone}</p>
          <ul className="flex flex-wrap gap-2">{topics.map((tp) => <li key={tp} className="rounded bg-neutral px-3 py-1 text-sm">{tp}</li>)}</ul>
          <button type="button" disabled={saving} onClick={finish}
            className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg disabled:opacity-60">
            {saving ? t('common.loading') : t('onboarding.finish')}
          </button>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/onboarding"
git commit -m "feat: add onboarding wizard with resumable progress"
```

---

### Task 19: Dashboard (#4) + Posts list (#5) + onboarding-incomplete guard

**Files:**
- Create: `app/(app)/dashboard/page.tsx`, `app/(app)/posts/page.tsx`
- Create: `components/shared/OnboardingGate.tsx`
- Test: `app/(app)/posts/posts.spec.tsx`, `components/shared/OnboardingGate.spec.tsx`

**Interfaces:**
- Consumes: `usePosts`, `useCalendar` (Task 14); `useSessionContext`; `PostCard`, state components; `useLocale`; `formatNumber`; `next/navigation`.
- Produces:
  - `OnboardingGate({ children })` — when `user.hasBrandProfile === false`, renders an EmptyState prompting onboarding instead of children (used by dashboard, posts, generate).
  - Dashboard: counts per status, upcoming scheduled posts, quick actions.
  - Posts list: filters by status + platform, `PostCard` grid, empty/loading/error states.

- [ ] **Step 1: Write failing tests**

`components/shared/OnboardingGate.spec.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { OnboardingGate } from './OnboardingGate';

describe('OnboardingGate', () => {
  it('blocks content with a prompt when brand profile is incomplete', () => {
    renderWithProviders(<OnboardingGate><div>protected</div></OnboardingGate>, {
      user: { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: false },
    });
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
    expect(screen.getByText('أكمل دماغ الشركة')).toBeInTheDocument();
  });
  it('renders content when brand profile is complete', () => {
    renderWithProviders(<OnboardingGate><div>protected</div></OnboardingGate>, {
      user: { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true },
    });
    expect(screen.getByText('protected')).toBeInTheDocument();
  });
});
```
`app/(app)/posts/posts.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const usePostsMock = vi.fn();
vi.mock('@/hooks/usePosts', () => ({ usePosts: () => usePostsMock() }));

import PostsPage from './page';

const completeUser = { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true };

describe('PostsPage', () => {
  it('shows empty state with generate-first action when there are no posts', async () => {
    usePostsMock.mockReturnValue({ isLoading: false, isError: false, data: { items: [], total: 0, page: 1, pageSize: 20 } });
    renderWithProviders(<PostsPage />, { user: completeUser });
    await waitFor(() => expect(screen.getByText('لا بوستات بعد.')).toBeInTheDocument());
    expect(screen.getByText('ولّد أول بوست')).toBeInTheDocument();
  });
  it('renders post cards when posts exist', () => {
    usePostsMock.mockReturnValue({ isLoading: false, isError: false, data: { items: [{ id: 'p1', platform: 'x', status: 'draft', scheduledAt: null, text: 'محتوى', hashtags: [], hasImage: false, citationCount: 0 }], total: 1, page: 1, pageSize: 20 } });
    renderWithProviders(<PostsPage />, { user: completeUser });
    expect(screen.getByText('محتوى')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- posts OnboardingGate`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/shared/OnboardingGate.tsx`**

```tsx
'use client';
import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionContext } from '@/contexts/SessionContext';
import { useLocale } from '@/contexts/LocaleContext';
import { EmptyState } from './states/EmptyState';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useSessionContext();
  const { t } = useLocale();
  const router = useRouter();
  if (user && user.hasBrandProfile === false) {
    return <EmptyState title={t('onboarding.incompleteTitle')} actionLabel={t('onboarding.goToOnboarding')} onAction={() => router.push('/onboarding')} />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Implement `app/(app)/posts/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { usePosts } from '@/hooks/usePosts';
import { PostCard } from '@/components/shared/PostCard';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { EmptyState } from '@/components/shared/states/EmptyState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { OnboardingGate } from '@/components/shared/OnboardingGate';
import type { PostStatus, Platform, PostSummary } from '@/types/domain';

export default function PostsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<PostStatus | ''>('');
  const [platform, setPlatform] = useState<Platform | ''>('');
  const query = usePosts({ status: status || undefined, platform: platform || undefined });

  return (
    <OnboardingGate>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('posts.title')}</h1>
        <div className="flex gap-2">
          <select aria-label={t('posts.filterStatus')} value={status} onChange={(e) => setStatus(e.target.value as PostStatus | '')} className="min-h-touch rounded border border-border px-2">
            <option value="">{t('posts.all')}</option>
            <option value="draft">{t('status.draft')}</option>
            <option value="pending_review">{t('status.pending_review')}</option>
            <option value="approved">{t('status.approved')}</option>
            <option value="published">{t('status.published')}</option>
          </select>
          <select aria-label={t('posts.filterPlatform')} value={platform} onChange={(e) => setPlatform(e.target.value as Platform | '')} className="min-h-touch rounded border border-border px-2">
            <option value="">{t('posts.all')}</option>
            <option value="linkedin">{t('platform.linkedin')}</option>
            <option value="x">{t('platform.x')}</option>
          </select>
        </div>

        {query.isLoading ? <LoadingState /> :
         query.isError ? <ErrorState error={query.error as never} onRetry={() => query.refetch()} /> :
         query.data && query.data.items.length === 0 ?
           <EmptyState title={t('posts.empty')} actionLabel={t('posts.generateFirst')} onAction={() => router.push('/generate')} /> :
           <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
             {query.data?.items.map((p) => {
               const summary: PostSummary = { id: p.id, platform: p.platform, status: p.status, scheduledAt: p.scheduledAt, excerpt: p.text.slice(0, 120) };
               return <li key={p.id}><PostCard post={summary} onOpen={(id) => router.push(`/posts/${id}`)} /></li>;
             })}
           </ul>}
      </div>
    </OnboardingGate>
  );
}
```

- [ ] **Step 5: Implement `app/(app)/dashboard/page.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { formatNumber } from '@/lib/formatNumber';
import { usePosts } from '@/hooks/usePosts';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { PostCard } from '@/components/shared/PostCard';
import { OnboardingGate } from '@/components/shared/OnboardingGate';
import type { PostStatus, PostSummary } from '@/types/domain';

const STATUSES: PostStatus[] = ['draft', 'pending_review', 'approved', 'published'];

export default function DashboardPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const query = usePosts();

  return (
    <OnboardingGate>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">{t('dashboard.title')}</h1>
        <div className="flex gap-2">
          <button onClick={() => router.push('/generate')} className="min-h-touch rounded bg-primary px-4 text-primary-fg">{t('dashboard.quickGenerate')}</button>
          <button onClick={() => router.push('/generate')} className="min-h-touch rounded bg-neutral px-4 text-neutral-fg">{t('dashboard.quickMonthPlan')}</button>
        </div>

        {query.isLoading ? <LoadingState /> :
         query.isError ? <ErrorState error={query.error as never} onRetry={() => query.refetch()} /> : (
          <>
            <section className="space-y-2">
              <h2 className="text-sm text-muted">{t('dashboard.countsTitle')}</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {STATUSES.map((s) => {
                  const count = query.data?.items.filter((p) => p.status === s).length ?? 0;
                  return (
                    <li key={s} className="rounded-lg border border-border bg-surface p-4">
                      <p className="text-2xl font-semibold">{formatNumber(count, locale)}</p>
                      <p className="text-sm text-muted">{t(`status.${s}`)}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="space-y-2">
              <h2 className="text-sm text-muted">{t('dashboard.upcoming')}</h2>
              {(() => {
                const upcoming = (query.data?.items ?? []).filter((p) => p.status === 'approved' && p.scheduledAt).slice(0, 5);
                if (upcoming.length === 0) return <p className="text-muted">{t('dashboard.noUpcoming')}</p>;
                return (
                  <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {upcoming.map((p) => {
                      const summary: PostSummary = { id: p.id, platform: p.platform, status: p.status, scheduledAt: p.scheduledAt, excerpt: p.text.slice(0, 120) };
                      return <li key={p.id}><PostCard post={summary} onOpen={(id) => router.push(`/posts/${id}`)} /></li>;
                    })}
                  </ul>
                );
              })()}
            </section>
          </>
        )}
      </div>
    </OnboardingGate>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- posts OnboardingGate`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/dashboard" "app/(app)/posts" components/shared/OnboardingGate.tsx components/shared/OnboardingGate.spec.tsx
git commit -m "feat: add dashboard, posts list, and onboarding gate"
```

---

### Task 20: Post editor screen (#6)

**Files:**
- Create: `app/(app)/posts/[postId]/page.tsx`
- Test: `app/(app)/posts/[postId]/editor.spec.tsx`

**Interfaces:**
- Consumes: `usePost`, `useApprovePost` (Task 14); `postsService.patch`, `postsService.regenerate` (Task 13); `SourceList`, `ImagePreview`, `CharCounter`, `StatusBadge` + `deriveStatusKind`; state components; `useToast`; `useLocale`; `next/navigation`.
- Produces: editor showing engine output (text + sources + image), inline edit with `CharCounter`, `issues` shown as transparent non-blocking notes, save/approve/regenerate actions with sticky bottom action bar on mobile.

- [ ] **Step 1: Write failing test**

`app/(app)/posts/[postId]/editor.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ postId: 'p1' }) }));

const usePostMock = vi.fn();
vi.mock('@/hooks/usePost', () => ({ usePost: () => usePostMock() }));
const approveAsync = vi.fn();
vi.mock('@/hooks/useApprovePost', () => ({ useApprovePost: () => ({ mutateAsync: approveAsync, isPending: false }) }));
const patchFn = vi.fn();
vi.mock('@/services/posts', () => ({ postsService: { patch: (...a: unknown[]) => patchFn(...a), regenerate: vi.fn() } }));

import EditorPage from './page';

const basePost = {
  id: 'p1', tenantId: 't', brandProfileId: 'b', platform: 'x', status: 'pending_review',
  text: 'النص الأصلي', hashtags: [], scheduledAt: null, image: null,
  citations: [{ claim: 'حقيقة', sourceUrl: 'https://example.com' }], issues: ['نبرة غير متطابقة'], createdAt: '2026-06-29T00:00:00Z',
};

describe('EditorPage', () => {
  beforeEach(() => { approveAsync.mockReset(); patchFn.mockReset(); });

  it('shows engine output: text, sources, and quality issues', () => {
    usePostMock.mockReturnValue({ isLoading: false, isError: false, data: basePost });
    renderWithProviders(<EditorPage />);
    expect(screen.getByDisplayValue('النص الأصلي')).toBeInTheDocument();
    expect(screen.getByText('حقيقة —')).toBeInTheDocument();
    expect(screen.getByText('نبرة غير متطابقة')).toBeInTheDocument();
  });

  it('approve does not block when issues are present', async () => {
    usePostMock.mockReturnValue({ isLoading: false, isError: false, data: basePost });
    approveAsync.mockResolvedValue(basePost);
    renderWithProviders(<EditorPage />);
    await userEvent.click(screen.getByRole('button', { name: 'اعتماد' }));
    await waitFor(() => expect(approveAsync).toHaveBeenCalledWith('p1'));
  });

  it('saves an edited text via patch', async () => {
    usePostMock.mockReturnValue({ isLoading: false, isError: false, data: basePost });
    patchFn.mockResolvedValue({ ...basePost, text: 'محدّث' });
    renderWithProviders(<EditorPage />);
    const textarea = screen.getByDisplayValue('النص الأصلي');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'محدّث');
    await userEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    await waitFor(() => expect(patchFn).toHaveBeenCalledWith('p1', { text: 'محدّث' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- editor`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/(app)/posts/[postId]/page.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { usePost } from '@/hooks/usePost';
import { useApprovePost } from '@/hooks/useApprovePost';
import { postsService } from '@/services/posts';
import { SourceList } from '@/components/shared/SourceList';
import { ImagePreview } from '@/components/shared/ImagePreview';
import { CharCounter } from '@/components/shared/CharCounter';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { deriveStatusKind } from '@/components/shared/statusBadge.logic';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { isApiError } from '@/lib/apiClient';

export default function EditorPage() {
  const { postId } = useParams<{ postId: string }>();
  const { t } = useLocale();
  const { show } = useToast();
  const query = usePost(postId);
  const approve = useApprovePost();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (query.data) setText(query.data.text); }, [query.data]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState error={query.error as never} onRetry={() => query.refetch()} />;

  const post = query.data;
  const kind = deriveStatusKind(post);
  const locked = post.status === 'approved' || post.status === 'published';

  const onSave = async () => {
    setSaving(true);
    try {
      await postsService.patch(post.id, { text });
      show(t('editor.saved'), 'success');
    } catch (err) {
      show(isApiError(err) && err.code === 'CONTENT_LOCKED' ? t('editor.contentLocked') : t('common.genericError'), 'error');
    } finally { setSaving(false); }
  };

  const onApprove = async () => {
    try { await approve.mutateAsync(post.id); show(t('editor.approved'), 'success'); }
    catch (err) { show(isApiError(err) ? err.messageAr || t('common.genericError') : t('common.genericError'), 'error'); }
  };

  const onRegenerate = async () => {
    try { const fresh = await postsService.regenerate(post.id); setText(fresh.text); query.refetch(); }
    catch { show(t('common.genericError'), 'error'); }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('editor.title')}</h1>
        <StatusBadge status={kind} />
      </div>

      {post.issues.length > 0 && (
        <div role="note" className="rounded-lg border border-warning bg-warning p-3 text-warning-fg">
          <p className="mb-1 font-medium">{t('editor.issuesTitle')}</p>
          <ul className="list-disc ps-5 text-sm">{post.issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul>
        </div>
      )}

      <ImagePreview url={post.image?.url} alt={t('image.alt')} platform={post.platform} />

      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={locked} rows={10}
        className="w-full rounded border border-border bg-surface p-3 disabled:opacity-70" />

      <SourceList citations={post.citations} />

      {/* Sticky action bar (mobile-first) */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-surface p-3 md:static md:border-0 md:p-0">
        <CharCounter value={text} platform={post.platform} />
        <div className="flex gap-2">
          <button type="button" onClick={onRegenerate} className="min-h-touch rounded bg-neutral px-3 text-neutral-fg">{t('editor.regenerate')}</button>
          <button type="button" onClick={onSave} disabled={locked || saving} className="min-h-touch rounded bg-neutral px-3 text-neutral-fg disabled:opacity-60">{t('editor.save')}</button>
          <button type="button" onClick={onApprove} disabled={approve.isPending} className="min-h-touch rounded bg-primary px-3 text-primary-fg disabled:opacity-60">{t('editor.approve')}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- editor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/posts/[postId]"
git commit -m "feat: add post editor with sources, issues, char counter, and actions"
```

---

### Task 21: Generate screen (#7 — single post + month-plan async progress)

**Files:**
- Create: `app/(app)/generate/page.tsx`
- Test: `app/(app)/generate/generate.spec.tsx`

**Interfaces:**
- Consumes: `useGeneration`, `useMonthPlan` (Task 14); `postsService.regenerate` for failed-post retry; `StatusBadge`; state components; `useToast`; `useLocale`; `formatNumber`; `OnboardingGate`; `next/navigation`.
- Produces: tabbed single/month-plan UI. Single: platform + contentType + topic/brief → generate → route to editor; failure keeps inputs + retry. Month plan: count → start → live async progress bar (survives navigation via server-state); failed posts marked `failed` (StatusBadge) and retryable; completion shows calendar link.

- [ ] **Step 1: Write failing test**

`app/(app)/generate/generate.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
const genAsync = vi.fn();
vi.mock('@/hooks/useGeneration', () => ({ useGeneration: () => ({ mutateAsync: genAsync, isPending: false, error: null }) }));
const startFn = vi.fn();
let monthPlanState = { start: startFn, jobId: null as string | null, progress: undefined as unknown, isPolling: false, isStarting: false, error: null };
vi.mock('@/hooks/useMonthPlan', () => ({ useMonthPlan: () => monthPlanState }));

const completeUser = { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true };
import GeneratePage from './page';

describe('GeneratePage', () => {
  beforeEach(() => { pushMock.mockClear(); genAsync.mockReset(); startFn.mockReset(); monthPlanState = { start: startFn, jobId: null, progress: undefined, isPolling: false, isStarting: false, error: null }; });

  it('generates a single post and routes to its editor', async () => {
    genAsync.mockResolvedValue({ id: 'p9' });
    renderWithProviders(<GeneratePage />, { user: completeUser });
    await userEvent.click(screen.getByRole('button', { name: 'ولّد بوست' }));
    await waitFor(() => expect(genAsync).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith('/posts/p9');
  });

  it('shows month-plan progress with failed post marked and retryable', () => {
    monthPlanState = { ...monthPlanState, jobId: 'j1', isPolling: false,
      progress: { jobId: 'j1', done: 3, total: 3, status: 'completed', failedPosts: [{ postId: 'pf', error: 'x', code: 'provider_error' }] } };
    renderWithProviders(<GeneratePage />, { user: completeUser });
    expect(screen.getByText('فشل التوليد')).toBeInTheDocument();
    expect(screen.getByText('افتح التقويم')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- generate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/(app)/generate/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { formatNumber } from '@/lib/formatNumber';
import { useGeneration } from '@/hooks/useGeneration';
import { useMonthPlan } from '@/hooks/useMonthPlan';
import { postsService } from '@/services/posts';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { OnboardingGate } from '@/components/shared/OnboardingGate';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { isApiError } from '@/lib/apiClient';
import type { Platform, ContentType } from '@/types/domain';

const CONTENT_TYPES: { value: ContentType; key: string }[] = [
  { value: 'informational', key: 'generate.ctInformational' },
  { value: 'thought', key: 'generate.ctThought' },
  { value: 'announcement', key: 'generate.ctAnnouncement' },
  { value: 'engagement', key: 'generate.ctEngagement' },
];

export default function GeneratePage() {
  const { t, locale } = useLocale();
  const { show } = useToast();
  const router = useRouter();
  const generation = useGeneration();
  const monthPlan = useMonthPlan();

  const [tab, setTab] = useState<'single' | 'plan'>('single');
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [contentType, setContentType] = useState<ContentType>('informational');
  const [topic, setTopic] = useState('');
  const [brief, setBrief] = useState('');
  const [count, setCount] = useState(10);

  const onGenerate = async () => {
    try {
      const post = await generation.mutateAsync({ platform, contentType, topic: topic || undefined, brief: brief || undefined });
      router.push(`/posts/${post.id}`);
    } catch (err) {
      show(isApiError(err) ? err.messageAr || t('generate.generateFailed') : t('generate.generateFailed'), 'error');
    }
  };

  const progress = monthPlan.progress;

  return (
    <OnboardingGate>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">{t('generate.title')}</h1>
        <div role="tablist" className="flex gap-2">
          <button role="tab" aria-selected={tab === 'single'} onClick={() => setTab('single')}
            className={`min-h-touch rounded px-4 ${tab === 'single' ? 'bg-primary text-primary-fg' : 'bg-neutral text-neutral-fg'}`}>{t('generate.single')}</button>
          <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}
            className={`min-h-touch rounded px-4 ${tab === 'plan' ? 'bg-primary text-primary-fg' : 'bg-neutral text-neutral-fg'}`}>{t('generate.monthPlan')}</button>
        </div>

        {tab === 'single' && (
          <section className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="platform" className="block text-sm">{t('generate.platform')}</label>
              <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="min-h-touch w-full rounded border border-border px-2">
                <option value="linkedin">{t('platform.linkedin')}</option>
                <option value="x">{t('platform.x')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="ctype" className="block text-sm">{t('generate.contentType')}</label>
              <select id="ctype" value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)} className="min-h-touch w-full rounded border border-border px-2">
                {CONTENT_TYPES.map((c) => <option key={c.value} value={c.value}>{t(c.key)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="topic" className="block text-sm">{t('generate.topic')}</label>
              <input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="min-h-touch w-full rounded border border-border px-3" />
            </div>
            <div className="space-y-1">
              <label htmlFor="brief" className="block text-sm">{t('generate.brief')}</label>
              <textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className="w-full rounded border border-border px-3" />
            </div>
            <button type="button" onClick={onGenerate} disabled={generation.isPending}
              className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg disabled:opacity-60">
              {generation.isPending ? t('common.loading') : t('generate.generate')}
            </button>
            {generation.isError && <ErrorState error={generation.error} onRetry={onGenerate} />}
          </section>
        )}

        {tab === 'plan' && (
          <section className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="count" className="block text-sm">{t('generate.count')}</label>
              <input id="count" type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className="min-h-touch w-full rounded border border-border px-3" />
            </div>
            <button type="button" onClick={() => monthPlan.start(count)} disabled={monthPlan.isStarting || monthPlan.isPolling}
              className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg disabled:opacity-60">
              {t('generate.startPlan')}
            </button>

            {progress && (
              <div className="space-y-3">
                <p className="text-sm text-muted">{t('generate.progress')}: {formatNumber(progress.done, locale)} / {formatNumber(progress.total, locale)}</p>
                <div className="h-2 w-full overflow-hidden rounded bg-neutral" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                  <div className="h-full bg-primary" style={{ inlineSize: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>

                {progress.failedPosts && progress.failedPosts.length > 0 && (
                  <ul className="space-y-2">
                    {progress.failedPosts.map((f) => (
                      <li key={f.postId} className="flex items-center justify-between rounded border border-border p-2">
                        <StatusBadge status="failed" />
                        <button type="button" onClick={() => postsService.regenerate(f.postId)} className="min-h-touch rounded bg-neutral px-3 text-neutral-fg">{t('generate.failedRetry')}</button>
                      </li>
                    ))}
                  </ul>
                )}

                {progress.status === 'completed' && (
                  <button type="button" onClick={() => router.push('/calendar')} className="min-h-touch w-full rounded bg-primary px-4 text-primary-fg">{t('generate.viewCalendar')}</button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </OnboardingGate>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- generate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/generate"
git commit -m "feat: add generate screen with single post and async month-plan progress"
```

---

### Task 22: Calendar screen (#8)

**Files:**
- Create: `app/(app)/calendar/page.tsx`
- Test: `app/(app)/calendar/calendar.spec.tsx`

**Interfaces:**
- Consumes: `useCalendar`, `useReschedule` (Task 14); `CalendarGrid`; state components; `useToast`; `useLocale`; `OnboardingGate`; `next/navigation`.
- Produces: month navigation, `CalendarGrid` with occasions + scheduled posts, reschedule via picker (mobile alternative to drag), post click → editor. Loading/empty/error states.

- [ ] **Step 1: Write failing test**

`app/(app)/calendar/calendar.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const useCalendarMock = vi.fn();
vi.mock('@/hooks/useCalendar', () => ({ useCalendar: () => useCalendarMock() }));
vi.mock('@/hooks/useReschedule', () => ({ useReschedule: () => ({ mutate: vi.fn() }) }));

const completeUser = { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true };
import CalendarPage from './page';

describe('CalendarPage', () => {
  it('shows empty state when there are no entries', () => {
    useCalendarMock.mockReturnValue({ isLoading: false, isError: false, data: [] });
    renderWithProviders(<CalendarPage />, { user: completeUser });
    expect(screen.getByText('لا مناسبات أو بوستات هذا الشهر.')).toBeInTheDocument();
  });
  it('renders occasions and scheduled posts', () => {
    useCalendarMock.mockReturnValue({ isLoading: false, isError: false, data: [
      { type: 'occasion', date: '2026-07-04', occasion: { id: 'o1', tenantId: null, slug: 's', kind: 'commercial', nameAr: 'موسم', nameEn: 'S', startDate: '2026-07-04', endDate: '2026-07-04', hijriYear: 1448, gregorianYear: 2026 } },
    ] });
    renderWithProviders(<CalendarPage />, { user: completeUser });
    expect(screen.getByText('موسم')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- calendar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/(app)/calendar/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useCalendar } from '@/hooks/useCalendar';
import { useReschedule } from '@/hooks/useReschedule';
import { CalendarGrid } from '@/components/shared/CalendarGrid';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { EmptyState } from '@/components/shared/states/EmptyState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { OnboardingGate } from '@/components/shared/OnboardingGate';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const { t } = useLocale();
  const { show } = useToast();
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const query = useCalendar(month);
  const reschedule = useReschedule();

  const onReschedule = (postId: string, date: string) => {
    reschedule.mutate({ postId, date }, {
      onSuccess: () => show(t('calendar.reschedule'), 'success'),
      onError: () => show(t('common.genericError'), 'error'),
    });
  };

  return (
    <OnboardingGate>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t('calendar.title')}</h1>
          <div className="flex gap-2">
            <button type="button" aria-label={t('calendar.prevMonth')} onClick={() => setMonth(shiftMonth(month, -1))} className="min-h-touch rounded bg-neutral px-3">‹</button>
            <span className="min-h-touch content-center">{month}</span>
            <button type="button" aria-label={t('calendar.nextMonth')} onClick={() => setMonth(shiftMonth(month, 1))} className="min-h-touch rounded bg-neutral px-3">›</button>
          </div>
        </div>

        {query.isLoading ? <LoadingState /> :
         query.isError ? <ErrorState error={query.error as never} onRetry={() => query.refetch()} /> :
         query.data && query.data.length === 0 ? <EmptyState title={t('calendar.empty')} /> :
           <CalendarGrid month={month} entries={query.data ?? []} onOpenPost={(id) => router.push(`/posts/${id}`)} onReschedule={onReschedule} />}
      </div>
    </OnboardingGate>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- calendar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/calendar"
git commit -m "feat: add calendar screen with month nav and reschedule"
```

---

### Task 23: Manual publish screen (#9)

**Files:**
- Create: `app/(app)/publish/[postId]/page.tsx`
- Test: `app/(app)/publish/[postId]/publish.spec.tsx`

**Interfaces:**
- Consumes: `useExportAssets`, `useMarkPublished` (Task 14); `usePost`; `ImagePreview`, `StatusBadge`; state components; `useToast`; `useLocale`; `next/navigation`; clipboard API.
- Produces: per-platform copy-text (clipboard) + download-image + open-platform (deep link) + mark-published; visual confirmation after each action; no auto-publish. Link-placement hint per platform.

- [ ] **Step 1: Write failing test**

`app/(app)/publish/[postId]/publish.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ postId: 'p1' }) }));
const useExportMock = vi.fn();
vi.mock('@/hooks/useExportAssets', () => ({ useExportAssets: () => useExportMock() }));
const markAsync = vi.fn();
vi.mock('@/hooks/useMarkPublished', () => ({ useMarkPublished: () => ({ mutateAsync: markAsync, isPending: false }) }));
vi.mock('@/hooks/usePost', () => ({ usePost: () => ({ data: { id: 'p1', platform: 'x', status: 'approved', image: { url: 'https://x/img.png' } } }) }));

import PublishPage from './page';

const payload = {
  postId: 'p1', platform: 'x', formattedText: 'انسخني', imageUrl: 'https://x/img.png',
  deepLink: 'https://x.com/intent/post', link: { url: 'https://ex.com', placement: 'first_reply' },
  charCount: 7, limitMax: 280, notes: [],
};

describe('PublishPage', () => {
  beforeEach(() => { markAsync.mockReset(); Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }); });

  it('copies the formatted text to clipboard with confirmation', async () => {
    useExportMock.mockReturnValue({ isLoading: false, isError: false, data: payload });
    renderWithProviders(<PublishPage />);
    await userEvent.click(screen.getByRole('button', { name: 'انسخ النص' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('انسخني'));
    expect(screen.getByText('تم النسخ.')).toBeInTheDocument();
  });

  it('marks the post as published', async () => {
    useExportMock.mockReturnValue({ isLoading: false, isError: false, data: payload });
    markAsync.mockResolvedValue({ postId: 'p1', status: 'published', publishedAt: '2026-07-01' });
    renderWithProviders(<PublishPage />);
    await userEvent.click(screen.getByRole('button', { name: 'علّم «تم النشر»' }));
    await waitFor(() => expect(markAsync).toHaveBeenCalledWith('p1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publish`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/(app)/publish/[postId]/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { usePost } from '@/hooks/usePost';
import { useExportAssets } from '@/hooks/useExportAssets';
import { useMarkPublished } from '@/hooks/useMarkPublished';
import { ImagePreview } from '@/components/shared/ImagePreview';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { isApiError } from '@/lib/apiClient';

export default function PublishPage() {
  const { postId } = useParams<{ postId: string }>();
  const { t } = useLocale();
  const { show } = useToast();
  const post = usePost(postId);
  const platform = post.data?.platform ?? 'linkedin';
  const exportQuery = useExportAssets(postId, platform);
  const markPublished = useMarkPublished();
  const [copied, setCopied] = useState(false);

  if (exportQuery.isLoading) return <LoadingState />;
  if (exportQuery.isError || !exportQuery.data) {
    const err = exportQuery.error as { code?: string } | null;
    const message = err?.code === 'not_approved' ? t('publish.notApproved') : err?.code === 'exceeds_platform_limit' ? t('publish.exceedsLimit') : undefined;
    return <ErrorState error={message ? { code: err!.code!, messageAr: message, status: 409 } : (exportQuery.error as never)} onRetry={() => exportQuery.refetch()} />;
  }

  const payload = exportQuery.data;

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(payload.formattedText); setCopied(true); show(t('publish.copied'), 'success'); }
    catch { show(t('common.genericError'), 'error'); }
  };

  const onDownload = () => {
    if (!payload.imageUrl) return;
    const a = document.createElement('a');
    a.href = payload.imageUrl; a.download = `${payload.postId}.png`; a.target = '_blank';
    a.click();
    show(t('publish.downloaded'), 'success');
  };

  const onMark = async () => {
    try { await markPublished.mutateAsync(payload.postId); show(t('publish.marked'), 'success'); }
    catch (err) { show(isApiError(err) ? err.messageAr || t('common.genericError') : t('common.genericError'), 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('publish.title')}</h1>
        <span className="text-sm text-muted">{t(`platform.${payload.platform}`)}</span>
      </div>

      <ImagePreview url={payload.imageUrl} alt={t('image.alt')} platform={payload.platform} />

      <pre className="whitespace-pre-wrap rounded border border-border bg-surface p-3 text-text">{payload.formattedText}</pre>

      {payload.link && (
        <p className="text-sm text-muted">{payload.link.placement === 'first_reply' ? t('publish.linkHintReply') : t('publish.linkHintBody')}</p>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <button type="button" onClick={onCopy} className="min-h-touch rounded bg-neutral px-4 text-neutral-fg">{t('publish.copyText')}</button>
        <button type="button" onClick={onDownload} disabled={!payload.imageUrl} className="min-h-touch rounded bg-neutral px-4 text-neutral-fg disabled:opacity-60">{t('publish.downloadImage')}</button>
        <a href={payload.deepLink} target="_blank" rel="noopener noreferrer" className="min-h-touch content-center rounded bg-neutral px-4 text-center text-neutral-fg">{t('publish.openPlatform')}</a>
        <button type="button" onClick={onMark} disabled={markPublished.isPending} className="min-h-touch rounded bg-primary px-4 text-primary-fg disabled:opacity-60">{t('publish.markPublished')}</button>
      </div>

      {copied && <p className="text-sm text-success-fg">{t('publish.copied')}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- publish`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/publish"
git commit -m "feat: add manual publish screen with copy, download, deep link, mark-published"
```

---

### Task 24: Billing screen (#10) + Moyasar callback + quota block

**Files:**
- Create: `app/(app)/billing/page.tsx`, `app/(app)/billing/callback/page.tsx`
- Create: `components/shared/QuotaBlock.tsx`
- Test: `app/(app)/billing/billing.spec.tsx`, `components/shared/QuotaBlock.spec.tsx`

**Interfaces:**
- Consumes: `useBilling`, `useInvoices` (Task 14); `billingService.subscribe`, `billingService.cancel` (Task 13); state components; `useToast`; `useLocale`; `formatNumber`; `next/navigation`.
- Produces:
  - Billing: current plan + remaining quota (drafts/images/searches used/cap), upgrade (Moyasar redirect via `subscribe` → `transaction_url`/callback), cancel, invoices list with download. Trial-ended banner.
  - `QuotaBlock({ onUpgrade })` — reusable "plan limit reached" block (used here + linkable from generation flow) with upgrade CTA.
  - Callback page: shows "confirming payment" then routes to `/billing` (activation is webhook-authoritative; this is UX only).

- [ ] **Step 1: Write failing tests**

`components/shared/QuotaBlock.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';
import { QuotaBlock } from './QuotaBlock';

describe('QuotaBlock', () => {
  it('shows the limit message and fires upgrade', async () => {
    const onUpgrade = vi.fn();
    renderWithProviders(<QuotaBlock onUpgrade={onUpgrade} />);
    expect(screen.getByText('بلغت حدّ باقتك')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'رقِّ الآن' }));
    expect(onUpgrade).toHaveBeenCalled();
  });
});
```
`app/(app)/billing/billing.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const useBillingMock = vi.fn();
vi.mock('@/hooks/useBilling', () => ({ useBilling: () => useBillingMock() }));
vi.mock('@/hooks/useInvoices', () => ({ useInvoices: () => ({ isLoading: false, isError: false, data: [] }) }));

const completeUser = { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true };
import BillingPage from './page';

describe('BillingPage', () => {
  it('shows usage with used/cap counts', () => {
    useBillingMock.mockReturnValue({ isLoading: false, isError: false, data: {
      status: 'active', planCode: 'business', priceSar: 599, cycle: 'monthly',
      usage: { drafts: { used: 3, cap: 100 }, images: { used: 1, cap: 50 }, searches: { used: 2, cap: 30 } },
    } });
    renderWithProviders(<BillingPage />, { user: completeUser });
    expect(screen.getByText('المسودّات')).toBeInTheDocument();
    expect(screen.getByText(/٣/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- billing QuotaBlock`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/shared/QuotaBlock.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';

export function QuotaBlock({ onUpgrade }: { onUpgrade: () => void }) {
  const { t } = useLocale();
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-warning bg-warning p-6 text-center text-warning-fg">
      <p className="font-medium">{t('billing.quotaExceededTitle')}</p>
      <p className="text-sm">{t('billing.quotaExceededBody')}</p>
      <button type="button" onClick={onUpgrade} className="min-h-touch rounded bg-primary px-4 text-primary-fg">{t('billing.goToBilling')}</button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `app/(app)/billing/page.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { formatNumber } from '@/lib/formatNumber';
import { useBilling } from '@/hooks/useBilling';
import { useInvoices } from '@/hooks/useInvoices';
import { billingService } from '@/services/billing';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import { isApiError } from '@/lib/apiClient';

export default function BillingPage() {
  const { t, locale } = useLocale();
  const { show } = useToast();
  const billing = useBilling();
  const invoices = useInvoices();

  if (billing.isLoading) return <LoadingState />;
  if (billing.isError || !billing.data) return <ErrorState error={billing.error as never} onRetry={() => billing.refetch()} />;

  const sub = billing.data;
  const meters: { key: string; m: { used: number; cap: number } }[] = [
    { key: 'billing.usageDrafts', m: sub.usage.drafts },
    { key: 'billing.usageImages', m: sub.usage.images },
    { key: 'billing.usageSearches', m: sub.usage.searches },
  ];

  const onUpgrade = async () => {
    try {
      const res = await billingService.subscribe({ planCode: 'business', cycle: 'monthly' });
      // Moyasar.js handles card collection on the callback page; persist init data via session and redirect.
      sessionStorage.setItem('moyasar-init', JSON.stringify(res));
      window.location.href = res.callbackUrl;
    } catch (err) {
      show(isApiError(err) ? err.messageAr || t('common.genericError') : t('common.genericError'), 'error');
    }
  };

  const onCancel = async () => {
    try { await billingService.cancel(); show(t('billing.cancel'), 'success'); billing.refetch(); }
    catch { show(t('common.genericError'), 'error'); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('billing.title')}</h1>

      {sub.status === 'past_due' && <div role="alert" className="rounded bg-danger p-3 text-danger-fg">{t('billing.trialEnded')}</div>}

      <section className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted">{t('billing.currentPlan')}</p>
        <p className="text-lg font-semibold">{sub.planCode} — {formatNumber(sub.priceSar, locale)}</p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {meters.map(({ key, m }) => (
          <div key={key} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-muted">{t(key)}</p>
            <p className="text-text">{formatNumber(m.used, locale)} {t('billing.of')} {formatNumber(m.cap, locale)}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-neutral">
              <div className="h-full bg-primary" style={{ inlineSize: `${m.cap ? Math.min(100, (m.used / m.cap) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </section>

      <div className="flex gap-2">
        <button type="button" onClick={onUpgrade} className="min-h-touch rounded bg-primary px-4 text-primary-fg">{t('billing.upgrade')}</button>
        <button type="button" onClick={onCancel} className="min-h-touch rounded bg-neutral px-4 text-neutral-fg">{t('billing.cancel')}</button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm text-muted">{t('billing.invoices')}</h2>
        {invoices.isLoading ? <LoadingState /> :
         invoices.isError ? <ErrorState error={invoices.error as never} onRetry={() => invoices.refetch()} /> :
         (invoices.data ?? []).length === 0 ? <p className="text-muted">{t('billing.noInvoices')}</p> :
           <ul className="space-y-2">
             {invoices.data!.map((inv) => (
               <li key={inv.id} className="flex items-center justify-between rounded border border-border p-2">
                 <span>{inv.number} — {formatNumber(inv.totalMinor / 100, locale)} {inv.currency}</span>
                 <a href={`/api/v1/billing/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer" className="text-info-fg underline">{t('billing.downloadInvoice')}</a>
               </li>
             ))}
           </ul>}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Implement `app/(app)/billing/callback/page.tsx`**

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { LoadingState } from '@/components/shared/states/LoadingState';

// Moyasar return URL. Activation is webhook-authoritative; this page only reflects status
// and returns the user to billing. (Phase 6 contract: callback is UX-only.)
export default function BillingCallbackPage() {
  const { t } = useLocale();
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.push('/billing'), 1500);
    return () => clearTimeout(timer);
  }, [router]);
  return (
    <div className="space-y-4 p-8 text-center">
      <p className="text-muted">{t('billing.paymentReturn')}</p>
      <LoadingState />
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- billing QuotaBlock`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/billing" components/shared/QuotaBlock.tsx components/shared/QuotaBlock.spec.tsx
git commit -m "feat: add billing screen, Moyasar callback, and quota block"
```

---

### Task 25: Settings (#11) + Account profiles (#12)

**Files:**
- Create: `app/(app)/settings/page.tsx`, `app/(app)/settings/accounts/page.tsx`
- Test: `app/(app)/settings/settings.spec.tsx`, `app/(app)/settings/accounts/accounts.spec.tsx`

**Interfaces:**
- Consumes: `useSessionContext`, `useAuth` (logout), `useLocale` (locale switch); `authService.listAccounts/createAccount/deleteAccount` (Task 13); `useQuery`/`useQueryClient` for accounts; state components; `useToast`; `next/navigation`.
- Produces:
  - Settings: user details, language switcher (ar/en), logout.
  - Accounts: list linked LinkedIn/X profiles, add (platform + handle), remove. Empty/loading/error states.

- [ ] **Step 1: Write failing tests**

`app/(app)/settings/settings.spec.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

const logout = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout, login: {}, register: {} }) }));

const user = { user: { id: 'u', email: 'me@x.c', name: 'طارق' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true };
import SettingsPage from './page';

describe('SettingsPage', () => {
  it('shows user email and fires logout', async () => {
    renderWithProviders(<SettingsPage />, { user });
    expect(screen.getByText('me@x.c')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
    expect(logout).toHaveBeenCalled();
  });
  it('switches language to english', async () => {
    renderWithProviders(<SettingsPage />, { user });
    await userEvent.selectOptions(screen.getByLabelText('اللغة'), 'en');
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });
});
```
`app/(app)/settings/accounts/accounts.spec.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const listAccounts = vi.fn();
vi.mock('@/services/auth', () => ({ authService: { listAccounts: () => listAccounts(), createAccount: vi.fn(), deleteAccount: vi.fn() } }));

const user = { user: { id: 'u', email: 'e@x.c' }, tenant: { id: 't', name: 'T' }, subscription: { status: 'active', plan: 'business' }, hasBrandProfile: true };
import AccountsPage from './page';

describe('AccountsPage', () => {
  beforeEach(() => listAccounts.mockReset());
  it('shows empty state when no accounts are linked', async () => {
    listAccounts.mockResolvedValue([]);
    renderWithProviders(<AccountsPage />, { user });
    await waitFor(() => expect(screen.getByText('لا حسابات مربوطة بعد.')).toBeInTheDocument());
  });
  it('lists linked accounts', async () => {
    listAccounts.mockResolvedValue([{ id: 'a1', tenantId: 't', brandProfileId: 'b', platform: 'linkedin', handle: '@acme', createdAt: '2026-06-29' }]);
    renderWithProviders(<AccountsPage />, { user });
    await waitFor(() => expect(screen.getByText('@acme')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- settings accounts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `app/(app)/settings/page.tsx`**

```tsx
'use client';
import { useLocale } from '@/contexts/LocaleContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import type { Locale } from '@/i18n';

export default function SettingsPage() {
  const { t, locale, setLocale } = useLocale();
  const { user } = useSessionContext();
  const { logout } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

      <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm text-muted">{t('settings.accountTitle')}</h2>
        <p className="text-text">{user?.user.name}</p>
        <p className="text-text">{user?.user.email}</p>
      </section>

      <section className="space-y-2">
        <label htmlFor="lang" className="block text-sm text-muted">{t('settings.language')}</label>
        <select id="lang" value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="min-h-touch rounded border border-border px-2">
          <option value="ar">{t('settings.arabic')}</option>
          <option value="en">{t('settings.english')}</option>
        </select>
      </section>

      <Link href="/settings/accounts" className="block text-info-fg underline">{t('settings.accountsTitle')}</Link>

      <button type="button" onClick={logout} className="min-h-touch rounded bg-danger px-4 text-danger-fg">{t('settings.logout')}</button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `app/(app)/settings/accounts/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { authService } from '@/services/auth';
import { queryKeys } from '@/lib/queryKeys';
import { LoadingState } from '@/components/shared/states/LoadingState';
import { EmptyState } from '@/components/shared/states/EmptyState';
import { ErrorState } from '@/components/shared/states/ErrorState';
import type { AccountProfile, Platform } from '@/types/domain';

export default function AccountsPage() {
  const { t } = useLocale();
  const { show } = useToast();
  const { user } = useSessionContext();
  const qc = useQueryClient();
  const query = useQuery<AccountProfile[]>({ queryKey: queryKeys.accounts(), queryFn: () => authService.listAccounts() });
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [handle, setHandle] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.accounts() });

  const onAdd = async () => {
    if (!handle) return;
    try {
      // brandProfileId is provisional: linked from the tenant's brand profile id on the backend if omitted.
      await authService.createAccount({ brandProfileId: user?.tenant.id ?? '', platform, handle });
      setHandle(''); refresh(); show(t('settings.addAccount'), 'success');
    } catch { show(t('common.genericError'), 'error'); }
  };

  const onRemove = async (id: string) => {
    try { await authService.deleteAccount(id); refresh(); }
    catch { show(t('common.genericError'), 'error'); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('settings.accountsTitle')}</h1>

      <div className="flex gap-2">
        <select aria-label={t('generate.platform')} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="min-h-touch rounded border border-border px-2">
          <option value="linkedin">{t('platform.linkedin')}</option>
          <option value="x">{t('platform.x')}</option>
        </select>
        <input aria-label={t('settings.handle')} value={handle} onChange={(e) => setHandle(e.target.value)} className="min-h-touch flex-1 rounded border border-border px-3" />
        <button type="button" onClick={onAdd} className="min-h-touch rounded bg-primary px-4 text-primary-fg">{t('settings.addAccount')}</button>
      </div>

      {query.isLoading ? <LoadingState /> :
       query.isError ? <ErrorState error={query.error as never} onRetry={() => query.refetch()} /> :
       (query.data ?? []).length === 0 ? <EmptyState title={t('settings.accountsEmpty')} /> :
         <ul className="space-y-2">
           {query.data!.map((a) => (
             <li key={a.id} className="flex items-center justify-between rounded border border-border p-3">
               <span>{t(`platform.${a.platform}`)} — {a.handle}</span>
               <button type="button" onClick={() => onRemove(a.id)} className="min-h-touch rounded bg-danger px-3 text-danger-fg">{t('settings.remove')}</button>
             </li>
           ))}
         </ul>}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- settings accounts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/settings"
git commit -m "feat: add settings and account profiles screens"
```

---

### Task 26: Full verification (typecheck, full test run, production build)

**Files:**
- Modify: none (verification + fixes only)

**Interfaces:**
- Consumes: the whole app.
- Produces: a clean `typecheck`, full green test suite, and a successful `next build` (proves all 12 routes compile).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all spec files green.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors (fix any `next/lint` findings inline; e.g., add `eslint-disable` only where an `<img>` is intentional — already annotated).

- [ ] **Step 4: Production build (compiles every route)**

Run: `npm run build`
Expected: build succeeds; the route list includes `/login`, `/register`, `/onboarding`, `/dashboard`, `/posts`, `/posts/[postId]`, `/generate`, `/calendar`, `/publish/[postId]`, `/billing`, `/billing/callback`, `/settings`, `/settings/accounts`.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add -A
git commit -m "chore: verification pass — typecheck, tests, and production build green"
```

---

## Self-Review

**1. Spec coverage — each spec section maps to a task:**

| Spec requirement | Task(s) |
|---|---|
| 12 screens + App Router `(auth)`/`(app)` groups | Tasks 16–25 (routes), Task 16 (groups) |
| `(app)` protected by JWT auth guard | Task 16 (`AuthGuard`) |
| `dir=rtl lang=ar` root + IBM Plex Sans Arabic via `next/font` | Task 15 |
| All user text Arabic from i18n; identifiers English; en parity | Task 2 (dictionaries + parity test) |
| StatusBadge = single status path; Arabic a11y name not color-only | Task 8 |
| `scheduled`/`failed` derived (pure tested fn) | Task 8 (`deriveStatusKind`) |
| CharCounter: X via twitter-text weighted, LinkedIn 3000, premium 25000 | Task 9 |
| PostCard, SourceList, ImagePreview | Task 11 |
| CalendarGrid (occasions layer + scheduled posts + mobile reschedule) | Task 12, Task 22 |
| services/ layer (7 domains), no fetch in components | Task 13 |
| hooks/ server-state with keyed invalidation | Task 14 |
| apiClient: JWT inject, 401 refresh/gentle logout preserving path, ApiError | Task 4 |
| httpOnly-cookie-preferred storage isolated | Task 4 (`tokenStore`) |
| Client state contexts: Session/Locale/Toast | Tasks 2/6/7 |
| Loading/empty/error/success per screen | Task 10 states + every screen task |
| Login/Register (validation, loading, cross-links, Arabic errors, post-auth routing) | Task 17 + Task 14 (`useAuth` routing) |
| Onboarding wizard (5 steps, resumable, approve→profile→dashboard) | Task 18 |
| Dashboard (counts, upcoming, quick actions) | Task 19 |
| Posts list (filters by status/platform, empty→generate-first) | Task 19 |
| Editor (engine output, edit+CharCounter, issues non-blocking, save/approve/regenerate, learnedPreferences via backend on approve) | Task 20 |
| Generate (single→editor; month-plan async progress surviving nav; failed retryable) | Task 21 + Task 14 (`useMonthPlan`) |
| Calendar (Saudi occasions + scheduled posts, mobile picker reschedule) | Task 22 |
| Manual publish (copy/download/open/mark; confirmations; no auto-publish; link-placement hint) | Task 23 |
| Billing (plan + remaining quota, Moyasar upgrade redirect, invoices, cancel) | Task 24 |
| Quota-exceeded block + upgrade CTA | Task 24 (`QuotaBlock`) |
| Trial-ended banner | Task 24 |
| Settings (user, language ar/en, logout) | Task 25 |
| Account profiles (link/manage LinkedIn/X) | Task 25 |
| Onboarding-incomplete gate on app screens | Task 19 (`OnboardingGate`) |
| Mobile-first: BottomNav→SideNav, ≥44px (`min-h-touch`), single-column, no hover-only | Task 16 + tokens (`spacing.touch`) in Task 1 |
| Directional icons mirrored in RTL | Task 10 (`DirectionalIcon`) |
| Design tokens only (no raw colors / no `dark:`) | Task 1 (token-mapped Tailwind colors) |
| formatNumber single source | Task 2 |

Every acceptance-criteria checkbox in the spec is covered above. No gaps.

**2. Placeholder scan:** No `TODO`/`TBD`/"implement later"/"add validation"/"handle edge cases"/"similar to Task N" remain. Every code step contains complete code. Provisional contract points are explicitly flagged inline (month-plan polling, regenerate, reschedule-as-patch, `hasBrandProfile` derivation, `brandProfileId` on account create, Moyasar callback UX-only, `ExportPayload` deep link) — these are contract notes, not implementation placeholders.

**3. Type consistency:** Names are stable across tasks: `deriveStatusKind` (Task 8) used identically in Tasks 11/12/20; `StatusBadgeKind` (Task 8); `PostSummary`/`Post`/`PostListItem` (Task 3) used consistently in services (Task 13) and screens (Tasks 19–22); `ApiError` (Task 3) produced by `apiClient` (Task 4) and consumed by `ErrorState` (Task 10) + every hook (Task 14); `queryKeys` (Task 5) used by all hooks and invalidations; `countChars`/`counterZone`/`maxFor` (Task 9) match between logic and `CharCounter`; service method names (`generateSinglePost`, `startMonthPlan`, `getMonthPlanProgress`, `approve`, `regenerate`, `reschedule`, `getAssets`, `markPublished`, `getSubscription`, `subscribe`, `cancel`, `listInvoices`, `analyze`, `createProfile`) match between Task 13 definitions and hook/screen consumers. `tokenStore` API (`getAccess`/`getRefresh`/`set`/`clear`) consistent across Tasks 4/7/16. `renderWithProviders(user?)` signature (Task 7) used by all component/screen tests.

**Scope:** Single subsystem (the Athar frontend), produces working, tested software on its own. Backend (Phases 0–6) is consumed via `/api/v1`; contracts typed to documented shapes with provisional points flagged.
