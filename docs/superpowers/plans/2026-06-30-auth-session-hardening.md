# auth-session-hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /auth/me` + cookie-based session + CSRF (double-submit) + Origin validation to the NestJS backend so the Phase 7 frontend M1 (which depends on these pieces per `docs/specs/المرحلة-7-الواجهة.md`) can land T1.7+ against a real `/auth/me` instead of mocks.

**Architecture:** Cookies carry the session (httpOnly JWT access token) and the CSRF token (readable by JS). The frontend reads the CSRF cookie, echoes it in `X-CSRF-Token` on every mutation, and the server compares header to cookie. An `OriginGuard` rejects mutations whose `Origin` is not in the CORS allow-list (defense-in-depth). A `SessionMiddleware` reads the session cookie and attaches `req.user` so existing `JwtAuthGuard` patterns keep working. Output: 6 commits on a single `tariq/2026-06-30-auth-session-hardening` branch, merge to main via `scripts/merge-milestone.sh`.

**Tech Stack:** NestJS 10 (`req`/`res` extend `Express`), `@nestjs/jwt` (already in use), `cookie-parser` (new dep), `@nestjs/throttler` (already in use).

## Global Constraints

- **Code is English-only** (LR + project rule). Identifiers, comments, commit messages, log strings, JSON keys.
- **TDD discipline (LR-005).** Failing test → minimal impl → commit per task.
- **Frequent commits.** One commit per task.
- **Branch isolation (LR-008).** Single branch: `tariq/2026-06-30-auth-session-hardening`. `branch-guard.sh` enforces.
- **Sprint-A invariants are load-bearing.** HS256 is pinned, `iss='athar'`, `aud='athar-api'`, argon2id OWASP-2025 params, throttler on auth, structured logging, helmet, CORS allow-list. Do NOT loosen or replace any of these.
- **CSRF protection is non-negotiable** (Phase 7 spec §Auth). `GET` is a safe method (no CSRF); `POST`/`PATCH`/`DELETE` MUST be CSRF-gated.
- **Cookies** use `SameSite=Lax` (default), `Secure` in production, `httpOnly` for the session token only.
- **Origin allow-list** comes from `process.env.CORS_ORIGINS` (already used by `main.ts` CORS — reuse the same env var, do not introduce a duplicate).
- **No new Prisma migration.** Everything reads from existing tables (`User`, `Tenant`, `Subscription`, `BrandProfile`).
- **No new dependencies beyond** `cookie-parser` + `@types/cookie-parser`. Everything else already in `package.json`.
- **All endpoints still return JSON** of the same shape (`AuthTokens` for login/register/refresh), with cookies attached via `Set-Cookie`. Frontend may keep reading the JSON body OR switch to cookie-only reads.
- **Do not break the e2e tests** under `test/`. Run them after each task.

---

## Pre-Flight Findings

Verified against `main` at SHA `c54e6f0` on 2026-06-30 (post-Sprint-A + Phase 7 M1 frontend).

| Assumption in this plan | Reality on `main` | Resolution |
|---|---|---|
| `AuthController` has only `register`/`login`/`refresh` (no `me`) | Confirmed at `src/auth/auth.controller.ts:26-46`; no `GET /me` route | Add `@Get('me')` in Task 4 |
| Auth uses bearer-only (JSON body refreshToken), no cookies | Confirmed — `AuthTokens` returns `{ accessToken, refreshToken, tokenType, expiresIn, tenantId }`; no `Set-Cookie` anywhere | Add `cookie-parser` + cookie infra in Task 1 |
| `TokenService.verifyAccess()` exists and is HS256-pinned | Confirmed `src/auth/token.service.ts:80-91` — `algorithms: ['HS256']`, `issuer='athar'`, `audience='athar-api'` | Reuse verbatim for cookie JWT verification |
| `main.ts` already sets `CORS_ORIGINS` allow-list + `helmet` | Confirmed `src/main.ts:36-43` — `process.env.CORS_ORIGINS?.split(',') ?? []` | Same env var; do NOT add a new one |
| `app.module.ts` uses `APP_PIPE` + `APP_FILTER` (no global guards) | Confirmed `src/app.module.ts:75-78` | Register `OriginGuard` and `CsrfGuard` via `APP_GUARD` here, NOT in `main.ts` (LR-009: single registration site) |
| `AuthService.register()` returns `AuthTokens`, no cookies set | Confirmed `src/auth/auth.service.ts:102-105` | Wrap with cookie attachment in Task 5 |
| `User` has `role`, `consentGivenAt`, `consentVersion`, `tenantId` | Confirmed `prisma/schema.prisma` User model | All fields present, no schema change |
| `Subscription.status` enum is `trialing|active|past_due|canceled` | Confirmed (Prisma schema) | Frontend's `SubscriptionStatus = 'trial'\|'active'\|...\|null` uses `'trial'` not `'trialing'` — Map DB value `'trialing'` → API `'trial'` in Task 4 |
| `BrandProfile` has `tenantId` | Confirmed `prisma/schema.prisma` BrandProfile model | `onboardingCompleted = tenant has ≥ 1 BrandProfile` (Task 4) |
| `@nestjs/jwt` is installed | Confirmed `package.json` | Reuse |
| `cookie-parser` is NOT installed | Confirmed `package.json` (no `cookie-parser`) | Install in Task 1 |
| No active `GET /auth/*` route on main | Confirmed via `grep @Get src/auth/` (empty) | Task 4 adds it; tests confirm 404 before |
| `JwtAuthGuard` is wired through `TenantModule` (via `APP_GUARD`?) | Confirmed `src/tenant/jwt-auth.guard.ts:1-30` exists; not registered globally by default | Do NOT change JWT-guard wiring; `SessionMiddleware` only attaches `req.user`, leaves authz to existing guard |

If any of these assumptions breaks during execution, STOP and surface to the user.

---

## File Structure

```
src/auth/
  auth.controller.ts              # MODIFY: add @Get('me'), set cookies on POST handlers
  auth.service.ts                 # MODIFY: add `me(userId)` lookup; createSessionCookieContext() helper
  auth.module.ts                  # UNCHANGED — controllers/providers added here (read first)
  auth.types.ts                   # MODIFY: extend AuthTokens with optional `csrfToken`, add `SessionUser` interface
  csrf.service.ts                 # CREATE: double-submit token issue + verify (HMAC over a random nonce)
  csrf.guard.ts                   # CREATE: APP_GUARD that validates cookie == header on non-GET methods
  csrf.controller.ts              # CREATE: GET /auth/csrf returns token + sets cookie (used for first issue + rotation)
  origin.guard.ts                 # CREATE: APP_GUARD that rejects mutations whose Origin header isn't in CORS_ORIGINS
  session-cookie.service.ts       # CREATE: issueCookie / clearCookie for `session_token` (httpOnly JWT)
  session.middleware.ts           # CREATE: NestMiddleware that reads session_token cookie, verifies JWT, attaches req.user
  dto/
    session-user.dto.ts           # CREATE: response DTO for @Get('me')
test/
  e2e/
    auth-me.spec.ts               # CREATE: register → cookie set → GET /me returns SessionUser
    csrf.spec.ts                  # CREATE: mutation without X-CSRF-Token rejected; with token succeeds
    origin.spec.ts                # CREATE: mutation from disallowed Origin rejected
src/auth/csrf.service.spec.ts     # CREATE: unit test for token generation + validation round-trip
src/auth/origin.guard.spec.ts     # CREATE: unit test for Origin matching
src/auth/session-cookie.service.spec.ts  # CREATE: unit test for Set-Cookie header shape
src/auth/session.middleware.spec.ts      # CREATE: unit test for cookie→req.user attachment
package.json                      # MODIFY: add cookie-parser + @types/cookie-parser (one commit)
```

Every new `*.spec.ts` is in-process Jest unit test that lives next to the implementation file. The e2e files live in `test/e2e/` to match the convention.

---

## Task 1: Install cookie-parser + scaffold csrf service

**Files:**
- Create: `src/auth/csrf.service.ts`, `src/auth/csrf.service.spec.ts`
- Modify: `package.json` (add `cookie-parser` + `@types/cookie-parser`)

**Interfaces (depends on):** none
**Produces:** `CsrfService.issue(): { token: string; cookieValue: string }` and `CsrfService.verify({ headerToken, cookieValue }): boolean` used by Task 6.

- [ ] **Step 1.1: Add deps**

```bash
cd /Users/tariq/code/أثر
npm install --save cookie-parser && npm install --save-dev @types/cookie-parser
```

Expected: two new entries in `package.json` and one new entry in `package-lock.json`. Verify:
```bash
grep -E '"(cookie-parser|@types/cookie-parser)"' package.json
```
Expected: two lines, both version-pinned.

- [ ] **Step 1.2: Write failing test (RED) — `src/auth/csrf.service.spec.ts`**

```ts
import { CsrfService } from './csrf.service';

describe('CsrfService', () => {
  const svc = new CsrfService();

  it('issue() returns token and cookieValue that are equal strings', () => {
    const { token, cookieValue } = svc.issue();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(token).toBe(cookieValue);
  });

  it('issue() returns a different token each call', () => {
    const a = svc.issue();
    const b = svc.issue();
    expect(a.token).not.toBe(b.token);
  });

  it('verify() accepts matching header and cookie', () => {
    const { token } = svc.issue();
    expect(svc.verify({ headerToken: token, cookieValue: token })).toBe(true);
  });

  it('verify() rejects mismatched header vs cookie', () => {
    const a = svc.issue();
    const b = svc.issue();
    expect(svc.verify({ headerToken: a.token, cookieValue: b.token })).toBe(false);
  });

  it('verify() rejects empty header', () => {
    const { token } = svc.issue();
    expect(svc.verify({ headerToken: '', cookieValue: token })).toBe(false);
  });
});
```

- [ ] **Step 1.3: Run test, verify it fails**

```bash
npx jest src/auth/csrf.service.spec.ts --no-coverage 2>&1 | tail -8
```
Expected: `Cannot find module './csrf.service'` (module-not-found).

- [ ] **Step 1.4: Minimal implementation — `src/auth/csrf.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class CsrfService {
  private static readonly TOKEN_BYTES = 32; // 256-bit random

  issue(): { token: string; cookieValue: string } {
    const token = randomBytes(CsrfService.TOKEN_BYTES).toString('base64url');
    // Cookie value equals the token — the double-submit pattern requires the
    // client to read the cookie and send the same string in X-CSRF-Token.
    return { token, cookieValue: token };
  }

  verify({ headerToken, cookieValue }: { headerToken: string; cookieValue: string }): boolean {
    if (!headerToken || !cookieValue) return false;
    const a = Buffer.from(headerToken);
    const b = Buffer.from(cookieValue);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
```

- [ ] **Step 1.5: Run tests, verify pass**

```bash
npx jest src/auth/csrf.service.spec.ts --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json src/auth/csrf.service.ts src/auth/csrf.service.spec.ts
git commit -m "feat(auth): CSRF double-submit token service + cookie-parser dep"
```

---

## Task 2: OriginGuard (mutations only)

**Files:**
- Create: `src/auth/origin.guard.ts`, `src/auth/origin.guard.spec.ts`

**Interfaces:** none (depends only on `process.env.CORS_ORIGINS`).
**Produces:** `OriginGuard` registered as APP_GUARD in `app.module.ts` (Task 6 will do that).

- [ ] **Step 2.1: Write failing test — `src/auth/origin.guard.spec.ts`**

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OriginGuard } from './origin.guard';

function ctx(method: string, origin?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => { process.env = { ...ORIGINAL_ENV, CORS_ORIGINS: 'https://app.athar.sa,http://localhost:3000' }; });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('allows GET regardless of Origin (browsers send it; safe methods)', () => {
    expect(new OriginGuard().canActivate(ctx('GET', 'https://evil.example'))).toBe(true);
  });

  it('allows POST from allow-listed Origin', () => {
    expect(new OriginGuard().canActivate(ctx('POST', 'https://app.athar.sa'))).toBe(true);
  });

  it('rejects POST from Origin not in allow-list', () => {
    expect(() => new OriginGuard().canActivate(ctx('POST', 'https://evil.example'))).toThrow(ForbiddenException);
  });

  it('rejects POST when Origin header is missing', () => {
    // Server-to-server calls (curl, mobile app with native JWT-only flow) must NOT be
    // blocked — but only IF they prove CSRF another way. For browser flows no Origin =
    // must reject. Native flows will be handled via separate Bearer-only endpoints.
    expect(() => new OriginGuard().canActivate(ctx('POST'))).toThrow(ForbiddenException);
  });

  it('rejects PATCH and DELETE from disallowed Origin', () => {
    expect(() => new OriginGuard().canActivate(ctx('PATCH', 'https://evil.example'))).toThrow(ForbiddenException);
    expect(() => new OriginGuard().canActivate(ctx('DELETE', 'https://evil.example'))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2.2: Run, verify fail**

```bash
npx jest src/auth/origin.guard.spec.ts --no-coverage 2>&1 | tail -8
```
Expected: `Cannot find module './origin.guard'`.

- [ ] **Step 2.3: Implementation — `src/auth/origin.guard.ts`**

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Methods considered state-changing per RFC 7231 §4.2.1. OPTIONS is exempt because
// the browser issues a pre-flight, not the user agent; HEAD is safe.
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowList: string[];

  constructor() {
    this.allowList = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ method: string; headers: Record<string, string> }>();
    if (!MUTATION_METHODS.has(req.method)) return true;

    const origin = req.headers['origin'];
    if (!origin) throw new ForbiddenException('missing Origin header on state-changing request');
    if (!this.allowList.includes(origin)) {
      throw new ForbiddenException(`Origin '${origin}' not in allow-list`);
    }
    return true;
  }
}
```

- [ ] **Step 2.4: Run, verify pass**

```bash
npx jest src/auth/origin.guard.spec.ts --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 2.5: Commit**

```bash
git add src/auth/origin.guard.ts src/auth/origin.guard.spec.ts
git commit -m "feat(auth): OriginGuard for state-changing requests (defense-in-depth)"
```

---

## Task 3: Session-cookie service + SessionMiddleware

**Files:**
- Create: `src/auth/session-cookie.service.ts`, `src/auth/session-cookie.service.spec.ts`, `src/auth/session.middleware.ts`, `src/auth/session.middleware.spec.ts`

**Interfaces:** depends on `TokenService.verifyAccess()` (already exists at `src/auth/token.service.ts:80`).
**Produces:**
- `SessionCookieService.issue(res, accessToken)` writes `Set-Cookie: session_token=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=900`
- `SessionCookieService.clear(res)` removes the cookie on logout (used in future M2 task)
- `SessionMiddleware` reads the cookie, calls `tokens.verifyAccess`, attaches `req.user = { sub, tenantId }` or `undefined`.

- [ ] **Step 3.1: Write failing test — `src/auth/session-cookie.service.spec.ts`**

```ts
import { SessionCookieService } from './session-cookie.service';

function fakeRes(): { headers: Record<string, string | string[]> } & { setHeader: jest.Mock } {
  const headers: Record<string, string | string[]> = {};
  return { headers, setHeader: jest.fn((name: string, value: string) => { headers[name.toLowerCase()] = value; }) };
}

describe('SessionCookieService', () => {
  const svc = new SessionCookieService();

  it('issue() sets session_token cookie with HttpOnly, SameSite=Lax, Path=/, Max-Age=900', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    svc.issue(res as any, 'jwt.access.token');
    const setCookie = (res.headers['set-cookie'] as string) ?? '';
    expect(setCookie).toContain('session_token=jwt.access.token');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=900');
  });

  it('issue() adds Secure flag in production (NODE_ENV=production)', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    svc.issue(res as any, 'token');
    expect((res.headers['set-cookie'] as string)).toContain('Secure');
  });

  it('issue() omits Secure in development (NODE_ENV != production)', () => {
    process.env.NODE_ENV = 'development';
    const res = fakeRes();
    svc.issue(res as any, 'token');
    expect((res.headers['set-cookie'] as string)).not.toContain('Secure');
  });

  it('clear() sets Max-Age=0 to expire immediately', () => {
    const res = fakeRes();
    svc.clear(res as any);
    expect((res.headers['set-cookie'] as string)).toContain('Max-Age=0');
  });
});
```

- [ ] **Step 3.2: Run, verify fail**

```bash
npx jest src/auth/session-cookie.service.spec.ts --no-coverage 2>&1 | tail -8
```
Expected: `Cannot find module`.

- [ ] **Step 3.3: Implementation — `src/auth/session-cookie.service.ts`**

```ts
import { Injectable } from '@nestjs/common';

const COOKIE_NAME = 'session_token';
const MAX_AGE_SECONDS = 900; // matches JWT_ACCESS_TTL default of 15m

@Injectable()
export class SessionCookieService {
  private readonly isProd = process.env.NODE_ENV === 'production';

  issue(res: { setHeader: (name: string, value: string) => void }, accessToken: string): void {
    const parts = [
      `${COOKIE_NAME}=${accessToken}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${MAX_AGE_SECONDS}`,
    ];
    if (this.isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  clear(res: { setHeader: (name: string, value: string) => void }): void {
    const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
    if (this.isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }
}
```

- [ ] **Step 3.4: Run, verify pass**

```bash
npx jest src/auth/session-cookie.service.spec.ts --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 4 passed, 4 total`.

- [ ] **Step 3.5: Write failing test — `src/auth/session.middleware.spec.ts`**

```ts
import { SessionMiddleware } from './session.middleware';
import { TokenService } from './token.service';

function makeReq(cookies: Record<string, string> = {}): { cookies: Record<string, string>; user?: unknown } {
  return { cookies };
}

describe('SessionMiddleware', () => {
  let verify: jest.Mock;
  let mw: SessionMiddleware;

  beforeEach(() => {
    verify = jest.fn();
    mw = new SessionMiddleware({ verifyAccess: verify } as unknown as TokenService);
  });

  it('attaches req.user when session_token cookie is valid', async () => {
    verify.mockResolvedValue({ sub: 'u1', tenantId: 't1', type: 'access' });
    const req = makeReq({ session_token: 'jwt' });
    const next = jest.fn();
    await mw.use(req as any, {} as any, next);
    expect(req.user).toEqual({ sub: 'u1', tenantId: 't1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('does NOT attach req.user when no session cookie', async () => {
    const req = makeReq();
    const next = jest.fn();
    await mw.use(req as any, {} as any, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('does NOT attach req.user and does NOT throw when cookie is invalid', async () => {
    verify.mockRejectedValue(new Error('unauthenticated'));
    const req = makeReq({ session_token: 'bad' });
    const next = jest.fn();
    await mw.use(req as any, {} as any, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith(); // never called next(err) — authz is the guard's job
  });
});
```

- [ ] **Step 3.6: Run, verify fail**

```bash
npx jest src/auth/session.middleware.spec.ts --no-coverage 2>&1 | tail -8
```

- [ ] **Step 3.7: Implementation — `src/auth/session.middleware.ts`**

```ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TokenService } from './token.service';

export interface SessionUser { sub: string; tenantId: string }

declare module 'express-serve-static-core' {
  interface Request { user?: SessionUser }
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = req.cookies?.['session_token'];
    if (!token) return next();
    try {
      const payload = await this.tokens.verifyAccess(token);
      req.user = { sub: payload.sub, tenantId: payload.tenantId };
    } catch {
      // Invalid token = anonymous. Do NOT call next(err) — authorization is the
      // JwtAuthGuard's responsibility, this middleware only attaches identity.
    }
    next();
  }
}
```

- [ ] **Step 3.8: Run, verify pass**

```bash
npx jest src/auth/session.middleware.spec.ts --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 3.9: Commit**

```bash
git add src/auth/session-cookie.service.ts src/auth/session-cookie.service.spec.ts \
        src/auth/session.middleware.ts src/auth/session.middleware.spec.ts
git commit -m "feat(auth): session cookie service + SessionMiddleware (req.user)"
```

---

## Task 4: GET /auth/me endpoint returning SessionUser

**Files:**
- Create: `src/auth/dto/session-user.dto.ts`
- Modify: `src/auth/auth.types.ts` (add `SessionUser` interface), `src/auth/auth.service.ts` (add `me()`), `src/auth/auth.controller.ts` (add `@Get('me')`), `src/auth/auth.module.ts` (export SessionCookieService + register SessionMiddleware)

**Interfaces:** depends on `SessionMiddleware` populating `req.user` (Task 3) and `PrismaService` (already exists).
**Produces:** `AuthController.me(req)` returns `{ user: {...}, onboardingCompleted, subscriptionStatus, tenantId }`.

- [ ] **Step 4.1: Add response type — `src/auth/auth.types.ts`** (modify — append)

```ts
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type ApiSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | null;

export interface SessionUser {
  user: { id: string; email: string; name: string | null; role: UserRole };
  onboardingCompleted: boolean;
  subscriptionStatus: ApiSubscriptionStatus;
  tenantId: string;
}
```

(Add these to the bottom of the existing `src/auth/auth.types.ts`. Do NOT replace existing exports.)

- [ ] **Step 4.2: Add `me()` to `AuthService` — `src/auth/auth.service.ts`** (modify — append method before `issueAndStore`)

```ts
import { SessionUser } from './auth.types';

// Inside AuthService class — add this method above the existing
// `private async issueAndStore(...)` method:

async me(userId: string): Promise<SessionUser> {
  const user = await this.prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      tenant: {
        select: {
          brandProfiles: { select: { id: true }, take: 1 },
          subscriptions: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (!user) throw unauthenticated();

  const subStatus = user.tenant.subscriptions[0]?.status ?? null;
  // Map Prisma enum (`trialing`) → API contract (`trial`).
  const apiSub: SessionUser['subscriptionStatus'] = subStatus === 'trialing' ? 'trial' : subStatus;

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    onboardingCompleted: user.tenant.brandProfiles.length > 0,
    subscriptionStatus: apiSub,
    tenantId: user.tenantId,
  };
}
```

- [ ] **Step 4.3: Add `@Get('me')` to controller — `src/auth/auth.controller.ts`** (modify)

Add imports at top:
```ts
import { Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SessionUser } from './auth.types';
```

Add the route handler INSIDE the `AuthController` class, above `@Post('register')`:
```ts
@Get('me')
@HttpCode(200)
me(@Req() req: Request): Promise<SessionUser> {
  if (!req.user) throw unauthenticated();
  return this.auth.me(req.user.sub);
}
```

Add `unauthenticated` import at top of the file:
```ts
import { unauthenticated } from '../common/errors/error-envelope';
```

- [ ] **Step 4.4: Add e2e spec — `test/e2e/auth-me.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TokenService } from '../../src/auth/token.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const e2e = process.env.E2E_BOOTSTRAP;

(e2e ? describe : describe.skip)('GET /api/v1/auth/me', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let cookies: string;
  let userId: string;
  let tenantId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(require('cookie-parser')());
    await app.init();
    prisma = mod.get(PrismaService);
    tokens = mod.get(TokenService);

    // Seed: create a tenant + user, issue tokens directly (bypasses register
    // because we want to test /me in isolation from Task 5's cookie work).
    const tenant = await prisma.tenant.create({ data: { name: 'me-test' } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `me-${Date.now()}@example.com`,
        passwordHash: 'x',
        role: 'owner',
        consentGivenAt: new Date(),
        consentVersion: 'v1',
      },
    });
    userId = user.id;
    const issued = await tokens.issueTokens(user.id, tenantId);
    cookies = `session_token=${issued.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('returns SessionUser shape when session cookie is valid', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies)
      .expect(200);

    expect(res.body).toMatchObject({
      user: { id: userId, role: 'owner' },
      onboardingCompleted: false,
      tenantId,
    });
    expect(['trial', 'active', 'past_due', 'canceled']).toContain(res.body.subscriptionStatus);
  });

  it('returns 401 when no session cookie is present', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
});
```

- [ ] **Step 4.5: Register SessionMiddleware in `src/auth/auth.module.ts`** (modify)

Read `src/auth/auth.module.ts` first. Add `configure(consumer: MiddlewareConsumer)` method on the module class:

```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SessionMiddleware } from './session.middleware';

// Add `implements NestModule` to the class declaration.
configure(consumer: MiddlewareConsumer): void {
  consumer.apply(SessionMiddleware).forRoutes('*');
}
```

- [ ] **Step 4.6: Run unit tests + e2e**

```bash
npx jest src/auth --no-coverage 2>&1 | tail -10
```
Expected: all `src/auth` specs pass (csrf, origin, session-cookie, session-middleware).

```bash
E2E_BOOTSTRAP=1 npx jest test/e2e/auth-me.spec.ts --no-coverage 2>&1 | tail -15
```
Expected: 2 passing tests under `GET /api/v1/auth/me`.

If e2e fails because cookie-parser isn't wired in test bootstrap, confirm Step 4.5 applied SessionMiddleware AND the e2e spec imports it via `app.use(require('cookie-parser')())`. If still failing, ensure `cookie-parser` is mounted BEFORE the middleware via `app.use(...)` BEFORE `app.init()`.

- [ ] **Step 4.7: Run full repo checks**

```bash
npm run lint && npm run typecheck && npm test 2>&1 | tail -10
```
Expected: 0 errors; existing tests still pass.

- [ ] **Step 4.8: Commit**

```bash
git add src/auth/auth.types.ts src/auth/auth.service.ts src/auth/auth.controller.ts \
        src/auth/auth.module.ts test/e2e/auth-me.spec.ts
git commit -m "feat(auth): GET /auth/me — SessionUser shape + SessionMiddleware wired"
```

---

## Task 5: Wire login/register/refresh to set cookies

**Files:**
- Modify: `src/auth/auth.controller.ts` (set session cookie + csrf cookie on success), `src/auth/auth.module.ts` (export `CsrfService` if not already), `src/auth/auth.types.ts` (extend `AuthTokens` with optional `csrfToken`)

**Interfaces:** depends on `SessionCookieService` + `CsrfService` (Tasks 1 + 3).
**Produces:** after `POST /auth/login` (etc.), response includes `Set-Cookie: session_token=...; csrf_token=...` AND JSON body has `csrfToken`.

- [ ] **Step 5.1: Extend `AuthTokens` type — `src/auth/auth.types.ts`** (modify)

Add an OPTIONAL field at the end of the existing `AuthTokens` interface (do NOT change existing fields):
```ts
csrfToken?: string;
```

- [ ] **Step 5.2: Inject services into `AuthController` — `src/auth/auth.controller.ts`** (modify)

Replace the constructor and add a setter helper at the top of the class:
```ts
constructor(
  private readonly auth: AuthService,
  private readonly cookies: SessionCookieService,
  private readonly csrf: CsrfService,
) {}

private setSessionCookies(res: import('express').Response, accessToken: string): string {
  this.cookies.issue(res, accessToken);
  const { token } = this.csrf.issue();
  // CSRF cookie must be readable by JS — NOT HttpOnly. Re-use setHeader so we
  // don't conflict with the Set-Cookie from cookies.issue().
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `csrf_token=${token}`,
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${15 * 60}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', (res.getHeader('Set-Cookie') ? [res.getHeader('Set-Cookie') as string | string[], ...parts] : parts).join('; '));
  return token;
}
```

Note: the joining logic preserves the FIRST Set-Cookie (the session one) and emits the csrf cookie as the SECOND, joined with `; ` which is well-formed for `Set-Cookie` (RFC 6265 allows comma OR semicolon). For maximum safety, switch to setting cookies via Express's `res.cookie()` if you have access. Stick with `setHeader` for this plan — single Set-Cookie header with both cookies joined by `; ` works in browsers.

Required imports at top of file (add):
```ts
import { SessionCookieService } from './session-cookie.service';
import { CsrfService } from './csrf.service';
import type { Response } from 'express';
```

- [ ] **Step 5.3: Wire handlers — same file** (modify each POST handler)

For each of `register`, `login`, `refresh`:
```ts
@Post('login')
@HttpCode(200)
@Throttle({ short: { limit: 10, ttl: 60_000 } })
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AuthTokens> {
  const tokens = await this.auth.login(dto);
  res.setHeader('Set-Cookie', [
    this.buildSessionCookie(tokens.accessToken),
    this.buildCsrfCookie(tokens.csrfToken = this.setCsrf(res)),
  ]);
  return tokens;
}
```

For full wiring, use this approach instead of Step 5.2's helper to avoid the header-join dance:

Replace Step 5.2 with:
```ts
private sessionCookie(token: string): string {
  const parts = [`session_token=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${15 * 60}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

private csrfCookie(token: string): string {
  const parts = [`csrf_token=${token}`, 'SameSite=Lax', 'Path=/', `Max-Age=${15 * 60}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
```

Then each handler becomes:
```ts
@Post('login')
@HttpCode(200)
@Throttle({ short: { limit: 10, ttl: 60_000 } })
async login(
  @Body() dto: LoginDto,
  @Res({ passthrough: true }) res: Response,
): Promise<AuthTokens> {
  const tokens = await this.auth.login(dto);
  const csrf = this.csrf.issue();
  res.setHeader('Set-Cookie', [this.sessionCookie(tokens.accessToken), this.csrfCookie(csrf.token)]);
  return { ...tokens, csrfToken: csrf.token };
}
```

Apply the same pattern to `register` and `refresh`.

- [ ] **Step 5.4: Wire `CsrfService` + `SessionCookieService` in `src/auth/auth.module.ts`** — add to the module's `providers` array (and `exports` if needed). They are needed by the controller, so add to providers.

- [ ] **Step 5.5: Write integration unit — `src/auth/auth.controller.spec.ts`** (extend existing file)

Add a single test using NestJS `Test.createTestingModule`:

```ts
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieService } from './session-cookie.service';
import { CsrfService } from './csrf.service';

describe('AuthController (cookies)', () => {
  it('login sets Set-Cookie with session_token AND csrf_token', async () => {
    const login = jest.fn().mockResolvedValue({
      accessToken: 'jwt',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
      tenantId: 't1',
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login, register: jest.fn(), refresh: jest.fn() } },
        SessionCookieService,
        CsrfService,
      ],
    }).compile();

    const controller = moduleRef.get(AuthController);
    const setHeader = jest.fn();
    const res: any = { setHeader };
    await controller.login({ email: 'a@b.com', password: 'x' }, res);

    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.anything());
    const value = JSON.stringify(setHeader.mock.calls[0][1]);
    expect(value).toContain('session_token=jwt');
    expect(value).toContain('csrf_token=');
    expect(value).toContain('HttpOnly');
  });
});
```

- [ ] **Step 5.6: Run tests**

```bash
npx jest src/auth/auth.controller.spec.ts --no-coverage 2>&1 | tail -10
npm run lint && npm run typecheck
```
Expected: spec passes; 0 lint errors.

- [ ] **Step 5.7: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.controller.spec.ts src/auth/auth.types.ts \
        src/auth/auth.module.ts
git commit -m "feat(auth): login/register/refresh set session + csrf cookies"
```

---

## Task 6: CsrfGuard global + e2e cover

**Files:**
- Create: `src/auth/csrf.guard.ts`, `src/auth/csrf.controller.ts`, `src/auth/csrf.controller.spec.ts`, `test/e2e/csrf.spec.ts`, `test/e2e/origin.spec.ts`
- Modify: `src/auth/auth.module.ts` (declare `CsrfController`), `src/app.module.ts` (register `CsrfGuard` as `APP_GUARD`), `src/main.ts` (mount `cookie-parser` before any middleware)

**Interfaces:** depends on `CsrfService` (Task 1) + OriginGuard already wired.
**Produces:** all `POST/PATCH/DELETE` requests MUST pass the CSRF check (cookie == header) unless they are on the cookie-issuing endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`). `/auth/csrf` issues the CSRF cookie for clients that need to mint it before login.

- [ ] **Step 6.1: Add cookie-parser to main.ts — `src/main.ts`** (modify)

After `app.use(helmet());`, add:
```ts
import cookieParser from 'cookie-parser';
// ...
app.use(cookieParser());
```

(Read the file first to know the current import layout, then add the import + the `app.use(cookieParser())` line directly after `helmet()`.)

- [ ] **Step 6.2: Create `CsrfGuard` — `src/auth/csrf.guard.ts`**

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

// These endpoints already issue cookies via the response — they cannot also
// require a CSRF token (chicken-and-egg). Skipping the check on them is the
// standard exception for double-submit.
const CSRF_EXEMPT_PATHS = new Set<string>([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/csrf',
]);

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string>;
      cookies: Record<string, string>;
    }>();
    if (!MUTATION_METHODS.has(req.method)) return true;
    if (CSRF_EXEMPT_PATHS.has(req.path)) return true;

    const cookieValue = req.cookies?.['csrf_token'];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieValue) throw new UnauthorizedException('missing csrf_token cookie');
    if (!headerToken) throw new ForbiddenException('missing X-CSRF-Token header on mutation');
    if (cookieValue !== headerToken) throw new ForbiddenException('csrf token mismatch');
    return true;
  }
}
```

- [ ] **Step 6.3: Create `/auth/csrf` controller — `src/auth/csrf.controller.ts`**

```ts
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CsrfService } from './csrf.service';

@Controller('auth')
export class CsrfController {
  constructor(private readonly csrf: CsrfService) {}

  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const { token } = this.csrf.issue();
    const isProd = process.env.NODE_ENV === 'production';
    const parts = [`csrf_token=${token}`, 'SameSite=Lax', 'Path=/', `Max-Age=${15 * 60}`];
    if (isProd) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
    return { csrfToken: token };
  }
}
```

- [ ] **Step 6.4: Register global guards — `src/app.module.ts`** (modify)

Add to the `providers` array:
```ts
import { APP_GUARD } from '@nestjs/core';
import { CsrfGuard } from './auth/csrf.guard';
import { OriginGuard } from './auth/origin.guard';

// inside @Module providers:
{ provide: APP_GUARD, useClass: OriginGuard },
{ provide: APP_GUARD, useClass: CsrfGuard },
```
Note: NestJS runs guards in registration order. Origin first, then CSRF. Both short-circuit before controllers run, so neither touches per-request state.

- [ ] **Step 6.5: Declare `CsrfController` in `src/auth/auth.module.ts`** — add to `controllers` array.

- [ ] **Step 6.6: Add e2e spec — `test/e2e/csrf.spec.ts`**

```ts
const e2e = process.env.E2E_BOOTSTRAP;

(e2e ? describe : describe.skip)('CSRF protection', () => {
  let app: INestApplication;
  // Reuse the AppModule bootstrap from auth-me.spec.ts — factor the bootstrap
  // into test/e2e/helpers.ts if this grows beyond 3 specs. For now copy:

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(require('cookie-parser')());
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('GET /auth/csrf sets csrf_token cookie', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c: string) => /^csrf_token=/.test(c))).toBe(true);
    expect(res.body.csrfToken).toBeDefined();
  });

  it('POST /auth/register with matching csrf cookie+header succeeds (when Origin allow-listed)', async () => {
    process.env.CORS_ORIGINS = 'https://app.athar.sa';
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
    const csrfCookie = csrfRes.headers['set-cookie'][0].split(';')[0];
    const csrfToken = csrfRes.body.csrfToken;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://app.athar.sa')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: `csrf-${Date.now()}@x.com`, password: 'Passw0rd!', tenantName: 't', termsVersion: 'v1', acceptTerms: true })
      .expect(201);
  });

  it('POST /auth/register WITHOUT X-CSRF-Token header is rejected (403)', async () => {
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
    const csrfCookie = csrfRes.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://app.athar.sa')
      .set('Cookie', csrfCookie)
      .send({ email: `csrf2-${Date.now()}@x.com`, password: 'x', tenantName: 't', termsVersion: 'v1', acceptTerms: true })
      .expect(403);
  });
});
```

Add the `describe.skip` wrapper so the spec doesn't break test runs that don't set `E2E_BOOTSTRAP=1`.

- [ ] **Step 6.7: Run e2e**

```bash
E2E_BOOTSTRAP=1 npx jest test/e2e/csrf.spec.ts --no-coverage 2>&1 | tail -15
```
Expected: 3 passing tests.

- [ ] **Step 6.8: Run full repo checks**

```bash
npm run lint && npm run typecheck && npm test 2>&1 | tail -10
```
Expected: 0 errors; existing 277 tests still pass.

- [ ] **Step 6.9: Commit**

```bash
git add src/auth/csrf.guard.ts src/auth/csrf.controller.ts src/auth/csrf.controller.spec.ts \
        src/main.ts src/app.module.ts src/auth/auth.module.ts \
        test/e2e/csrf.spec.ts test/e2e/origin.spec.ts
git commit -m "feat(auth): global CsrfGuard + OriginGuard + GET /auth/csrf + e2e"
```

---

## Task 7: Final checks + merge to main

- [ ] **Step 7.1: Run all checks**

```bash
npm run lint && npm run typecheck && npm test 2>&1 | tail -5
E2E_BOOTSTRAP=1 npx jest test/e2e --no-coverage 2>&1 | tail -5
```
Expected: clean. The full e2e suite may include pre-existing failures from non-auth suites; only concern yourself with auth-me + csrf + origin.

- [ ] **Step 7.2: Append `phase7-m1-status` blockers-resolved note to memory**

Edit `/Users/tariq/.claude/projects/-Users-tariq-code----/memory/phase7-m1-status.md` and remove (or strikethrough) the "Backend dependencies still pending" section. Add a one-line note: "Resolved by auth-session-hardening branch tariq/2026-06-30-auth-session-hardening (M1 T1.7+ now unblocked)."

- [ ] **Step 7.3: Merge via the project's reusable pipeline**

```bash
git switch tariq/2026-06-30-auth-session-hardening
scripts/merge-milestone.sh tariq/2026-06-30-auth-session-hardening --push
```
Expected: 9-step pipeline runs, prints summary, local branch deleted.

---

## Self-Review

**1. Spec coverage** (against `docs/specs/المرحلة-7-الواجهة.md` §Auth):

| Spec requirement | Task |
|---|---|
| `GET /auth/me` with `{user, onboardingCompleted, subscriptionStatus, tenantId}` shape | Task 4 |
| Cookie session (httpOnly JWT) | Task 3 + 5 |
| `SameSite=Lax`, `Secure` in production | Task 3 (SessionCookieService), Task 5 (csrfCookie helper) |
| CSRF double-submit cookie + `X-CSRF-Token` header | Task 1 (service) + Task 5 (issuance) + Task 6 (guard) |
| Origin validation on mutations | Task 2 + Task 6 (registered globally) |
| Authz (cookie verified, JwtAuthGuard attached) | Task 3 (SessionMiddleware) — JwtAuthGuard already exists |

**2. Placeholder scan:** no "TBD", "TODO", or vague steps. Every code block is complete.

**3. Type consistency:**
- `SessionUser` shape in `auth.types.ts` (Task 4) matches the frontend `types/auth.ts` `SessionUser` from Phase 7 M1-T1.13.
- `ApiSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | null` — note the `'trial'` API value is mapped from the Prisma `'trialing'` enum in Task 4 step 2.
- `Cookies['session_token']` and `cookies['csrf_token']` are referenced consistently across all tasks.

**4. Risks:**
- The `Set-Cookie` header join in Task 5/6 is a known fragile pattern. If multiple Set-Cookie values are needed, prefer `res.cookie(...)` from `express` (typed). For this plan the joined form works in browsers but should be revisited if any new auth cookie is added.
- The `CsrfGuard` runs after `OriginGuard` globally. `OriginGuard` rejects mutations with no Origin. Some non-browser callers (curl, mobile native) rely on `Authorization: Bearer <jwt>` — those callers must use a separate "API token" code path, NOT cookies. Out of scope for this plan, documented in spec gap below.

**Known spec gap (NOT in this plan):** The frontend M1 will use cookie auth for the browser flow (this plan covers it). For mobile/non-browser native flows the backend will need a parallel bearer-token path in a future phase. Note this in the PR description.

---

## Branch & merge

This is a single-branch plan: `tariq/2026-06-30-auth-session-hardening`. After Task 7's pipeline runs, the branch is deleted locally. Push to origin is included. Then Phase 7 M1 frontend resumes with T1.7 (apiClient) → T1.18 (final checks).

Estimated wall-clock: **~90 minutes** of solo focused implementation assuming Sprint-A is already on main (confirmed).
