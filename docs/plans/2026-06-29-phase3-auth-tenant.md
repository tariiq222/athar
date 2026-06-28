# Phase 3 — Auth + Tenant + Account Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the identity and logical-isolation layer for أثر — email/password auth with JWT access+refresh and refresh-token rotation, a `TenantContext` injected into every authenticated request that prevents scope leakage, account-profile CRUD scoped to the tenant, `GET /me`, and PDPL data-rights routes (`POST /me/export`, `DELETE /me`) — exporting the canonical auth/tenant contract that all later phases consume.

**Architecture:** NestJS 10 modular design over Prisma 5 / PostgreSQL 16, building on the Sprint 0 foundation. `AuthModule` owns register/login/refresh and password hashing (argon2id). `TenantModule` owns `JwtAuthGuard`, `TenantGuard`, the `@CurrentTenant()` param decorator and the `TenantContext` type. `UserModule` owns `GET /me` and the PDPL `POST /me/export` + `DELETE /me` routes. `AccountProfileModule` owns `/accounts` CRUD. A `GlobalExceptionFilter` normalizes every error into a single `ErrorEnvelope`. `tenantId` is derived ONLY from the verified JWT — never from body or query — and a Prisma client extension injects `tenantId` as a second line of defense.

**Tech Stack:** Node 20+ / TypeScript, NestJS 10, Prisma 5 + PostgreSQL 16, `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt`, `argon2`, `class-validator` + `class-transformer`, Jest (config from Sprint 0).

## Global Constraints

- Multi-tenant logical: every isolatable domain row carries `tenantId`; no per-customer DB. (from Sprint 0)
- `tenantId` comes ONLY from the verified JWT — never from request body or query params. Forged scope is impossible by construction.
- Resources belonging to another tenant return `404` (never `403`) — do not leak existence.
- Code, identifiers, comments, commit messages: **English only**. Arabic appears ONLY in user-facing error `message` strings (per the spec error table in section 6.1).
- Route prefix `api/v1` is already set in Sprint 0 via `app.setGlobalPrefix('api/v1')`. Routes in this plan are relative to it (e.g. `@Controller('auth')` → `/api/v1/auth`).
- Canonical exported contract (name these EXACTLY): `TenantContext = { userId: string; tenantId: string }`, `@CurrentTenant()` param decorator, `JwtAuthGuard`, `TenantGuard`, `ErrorEnvelope = { statusCode: number; error: string; message: string }`.
- Existing Prisma models from Sprint 0: `Tenant, User, BrandProfile, AccountProfile, Post, ImageAsset, SourceCitation, Subscription, UsageRecord`; enums `Platform, PostStatus, SubscriptionStatus`. The Sprint 0 schema ALREADY defines `User.passwordHash`, `User.createdAt`, `AccountProfile.tenantId`, `Tenant.createdAt`, all `Subscription` fields (`status, plan, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, createdAt`) and `SubscriptionStatus`.
- **Migration guidance:** This phase adds NEW columns to the Sprint 0 schema and needs ONE new migration: `User.refreshTokenHash` (nullable), `User.deletedAt` (nullable), `Tenant.deletedAt` (nullable), `Tenant.purgeAfter` (nullable). Subscription fields and `SubscriptionStatus` already exist — no migration for those; this phase only INSERTS a `Subscription` row (status `trialing`, `trialEndsAt = now + TRIAL_DURATION_DAYS`) at register.
- Env vars (add to `.env.example`): `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (e.g. `15m`), `JWT_REFRESH_TTL` (e.g. `7d`), `TRIAL_DURATION_DAYS=7`, `PURGE_RETENTION_DAYS=30`.
- `passwordHash` and `refreshTokenHash` are NEVER serialized in any response.
- TDD: failing test first, run-fails, minimal impl, run-passes, commit per task.

## File Structure

```
prisma/schema.prisma                                  # MODIFY: add refreshTokenHash, deletedAt, purgeAfter
prisma/migrations/<ts>_phase3_auth_tenant/            # NEW migration

src/common/errors/error-envelope.ts                   # ErrorEnvelope type + AppException + error catalog
src/common/errors/error-envelope.spec.ts
src/common/filters/global-exception.filter.ts         # GlobalExceptionFilter -> ErrorEnvelope
src/common/filters/global-exception.filter.spec.ts

src/auth/dto/register.dto.ts                           # RegisterDto
src/auth/dto/login.dto.ts                              # LoginDto
src/auth/dto/refresh.dto.ts                            # RefreshDto
src/auth/auth.types.ts                                 # JwtPayload, AuthTokens
src/auth/password.service.ts                           # argon2 hash/verify
src/auth/password.service.spec.ts
src/auth/token.service.ts                              # sign/verify access+refresh
src/auth/token.service.spec.ts
src/auth/auth.service.ts                               # register/login/refresh
src/auth/auth.service.spec.ts
src/auth/auth.controller.ts                            # POST /auth/register|login|refresh
src/auth/auth.module.ts

src/tenant/tenant-context.ts                           # TenantContext type (canonical)
src/tenant/current-tenant.decorator.ts                 # @CurrentTenant()
src/tenant/jwt-auth.guard.ts                           # JwtAuthGuard
src/tenant/jwt-auth.guard.spec.ts
src/tenant/tenant.guard.ts                             # TenantGuard
src/tenant/tenant.guard.spec.ts
src/tenant/tenant.module.ts

src/prisma/tenant-scope.extension.ts                   # Prisma client extension injecting tenantId
src/prisma/tenant-scope.extension.spec.ts

src/user/user.service.ts                               # me/export/softDelete
src/user/user.service.spec.ts
src/user/dto/delete-me.dto.ts                          # DeleteMeDto { confirm }
src/user/user.controller.ts                            # GET /me, POST /me/export, DELETE /me
src/user/user.module.ts

src/accounts/dto/create-account-profile.dto.ts         # CreateAccountProfileDto
src/accounts/dto/update-account-profile.dto.ts         # UpdateAccountProfileDto
src/accounts/account-profile.service.ts                # CRUD scoped to tenant
src/accounts/account-profile.service.spec.ts
src/accounts/account-profile.controller.ts             # /accounts CRUD
src/accounts/account-profile.module.ts

src/app.module.ts                                       # MODIFY: register modules + global filter + ValidationPipe
src/main.ts                                             # MODIFY: global ValidationPipe + filter

test/isolation.e2e-spec.ts                             # Tenant A cannot reach Tenant B (404)
test/auth.e2e-spec.ts                                  # register/login/refresh/me end-to-end
test/jest-e2e.json                                     # e2e jest config
```

---

### Task 1: ErrorEnvelope contract + AppException + error catalog

**Files:**
- Create: `src/common/errors/error-envelope.ts`
- Test: `src/common/errors/error-envelope.spec.ts`

**Interfaces:**
- Produces (canonical, consumed by every later task and every phase):
  - `interface ErrorEnvelope { statusCode: number; error: string; message: string }`
  - `class AppException extends HttpException` with `constructor(statusCode: number, error: string, message: string)` and `getEnvelope(): ErrorEnvelope`.
  - `const ERRORS` catalog: each entry `{ statusCode, error, message }` keyed by error code. Keys: `EMAIL_ALREADY_EXISTS, INVALID_CREDENTIALS, TOKEN_EXPIRED, INVALID_REFRESH_TOKEN, UNAUTHENTICATED, VALIDATION_ERROR, ACCOUNT_NOT_FOUND, CONFIRMATION_REQUIRED`.
  - Factory helpers: `emailAlreadyExists()`, `invalidCredentials()`, `tokenExpired()`, `invalidRefreshToken()`, `unauthenticated()`, `accountNotFound()`, `confirmationRequired()` — each returns a ready `AppException`.

- [ ] **Step 1: Write the failing test**

```ts
// src/common/errors/error-envelope.spec.ts
import { AppException, ERRORS, emailAlreadyExists, accountNotFound } from './error-envelope';

describe('error-envelope', () => {
  it('ERRORS catalog has every spec error code with status + arabic message', () => {
    expect(ERRORS.EMAIL_ALREADY_EXISTS).toEqual({
      statusCode: 409,
      error: 'EMAIL_ALREADY_EXISTS',
      message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
    });
    expect(ERRORS.INVALID_CREDENTIALS.statusCode).toBe(401);
    expect(ERRORS.ACCOUNT_NOT_FOUND.statusCode).toBe(404);
    expect(ERRORS.CONFIRMATION_REQUIRED.statusCode).toBe(422);
    expect(Object.keys(ERRORS).sort()).toEqual(
      [
        'ACCOUNT_NOT_FOUND',
        'CONFIRMATION_REQUIRED',
        'EMAIL_ALREADY_EXISTS',
        'INVALID_CREDENTIALS',
        'INVALID_REFRESH_TOKEN',
        'TOKEN_EXPIRED',
        'UNAUTHENTICATED',
        'VALIDATION_ERROR',
      ].sort(),
    );
  });

  it('AppException carries status code and exposes a typed envelope', () => {
    const ex = emailAlreadyExists();
    expect(ex.getStatus()).toBe(409);
    expect(ex.getEnvelope()).toEqual(ERRORS.EMAIL_ALREADY_EXISTS);
  });

  it('accountNotFound is 404 (never 403) to avoid leaking existence', () => {
    expect(accountNotFound().getStatus()).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- error-envelope`
Expected: FAIL — cannot find module `./error-envelope`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/common/errors/error-envelope.ts
import { HttpException } from '@nestjs/common';

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
}

export const ERRORS = {
  EMAIL_ALREADY_EXISTS: {
    statusCode: 409,
    error: 'EMAIL_ALREADY_EXISTS',
    message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
  },
  INVALID_CREDENTIALS: {
    statusCode: 401,
    error: 'INVALID_CREDENTIALS',
    message: 'البريد أو كلمة المرور غير صحيحة.',
  },
  TOKEN_EXPIRED: {
    statusCode: 401,
    error: 'TOKEN_EXPIRED',
    message: 'انتهت الجلسة، جدّد الدخول.',
  },
  INVALID_REFRESH_TOKEN: {
    statusCode: 401,
    error: 'INVALID_REFRESH_TOKEN',
    message: 'جلسة غير صالحة، سجّل الدخول من جديد.',
  },
  UNAUTHENTICATED: {
    statusCode: 401,
    error: 'UNAUTHENTICATED',
    message: 'يلزم تسجيل الدخول.',
  },
  VALIDATION_ERROR: {
    statusCode: 422,
    error: 'VALIDATION_ERROR',
    message: 'تحقّق من صحّة المدخلات.',
  },
  ACCOUNT_NOT_FOUND: {
    statusCode: 404,
    error: 'ACCOUNT_NOT_FOUND',
    message: 'العنصر غير موجود.',
  },
  CONFIRMATION_REQUIRED: {
    statusCode: 422,
    error: 'CONFIRMATION_REQUIRED',
    message: 'يلزم تأكيد الحذف صراحةً.',
  },
} as const satisfies Record<string, ErrorEnvelope>;

export class AppException extends HttpException {
  constructor(
    private readonly statusCode: number,
    private readonly errorCode: string,
    message: string,
  ) {
    super({ statusCode, error: errorCode, message }, statusCode);
  }

  getEnvelope(): ErrorEnvelope {
    return {
      statusCode: this.statusCode,
      error: this.errorCode,
      message: super.message,
    };
  }
}

function make(e: ErrorEnvelope): AppException {
  return new AppException(e.statusCode, e.error, e.message);
}

export const emailAlreadyExists = () => make(ERRORS.EMAIL_ALREADY_EXISTS);
export const invalidCredentials = () => make(ERRORS.INVALID_CREDENTIALS);
export const tokenExpired = () => make(ERRORS.TOKEN_EXPIRED);
export const invalidRefreshToken = () => make(ERRORS.INVALID_REFRESH_TOKEN);
export const unauthenticated = () => make(ERRORS.UNAUTHENTICATED);
export const accountNotFound = () => make(ERRORS.ACCOUNT_NOT_FOUND);
export const confirmationRequired = () => make(ERRORS.CONFIRMATION_REQUIRED);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- error-envelope`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/common/errors
git commit -m "feat: add ErrorEnvelope contract, AppException and error catalog"
```

---

### Task 2: GlobalExceptionFilter — normalize every error to ErrorEnvelope

**Files:**
- Create: `src/common/filters/global-exception.filter.ts`
- Test: `src/common/filters/global-exception.filter.spec.ts`

**Interfaces:**
- Consumes: `ErrorEnvelope`, `AppException`, `ERRORS` (Task 1).
- Produces: `@Catch() class GlobalExceptionFilter implements ExceptionFilter` — converts `AppException` (via `getEnvelope()`), Nest `BadRequestException` from validation (status 400 with `message` array) → `VALIDATION_ERROR` envelope at 422, any other `HttpException` → envelope at its status, and any unknown error → `{ statusCode: 500, error: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقّع.' }`. It writes the envelope as the JSON body with the matching HTTP status.

- [ ] **Step 1: Write the failing test**

```ts
// src/common/filters/global-exception.filter.spec.ts
import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { emailAlreadyExists } from '../errors/error-envelope';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('maps AppException to its envelope and status', () => {
    const { host, status, json } = mockHost();
    filter.catch(emailAlreadyExists(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'EMAIL_ALREADY_EXISTS',
      message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
    });
  });

  it('maps validation BadRequestException to VALIDATION_ERROR at 422', () => {
    const { host, status, json } = mockHost();
    filter.catch(new BadRequestException(['email must be an email']), host);
    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
      message: 'email must be an email',
    });
  });

  it('maps a generic HttpException to an envelope at its status', () => {
    const { host, status, json } = mockHost();
    filter.catch(new NotFoundException('nope'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, error: 'HTTP_ERROR', message: 'nope' });
  });

  it('maps an unknown error to 500 INTERNAL_ERROR', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقّع.',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- global-exception`
Expected: FAIL — cannot find module `./global-exception.filter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/common/filters/global-exception.filter.ts
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { AppException, ErrorEnvelope } from '../errors/error-envelope';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const envelope = this.toEnvelope(exception);
    res.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppException) {
      return exception.getEnvelope();
    }

    if (exception instanceof BadRequestException) {
      // class-validator failures surface here as BadRequest (400).
      const message = this.firstValidationMessage(exception);
      return { statusCode: 422, error: 'VALIDATION_ERROR', message };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { statusCode: status, error: 'HTTP_ERROR', message: exception.message };
    }

    return { statusCode: 500, error: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقّع.' };
  }

  private firstValidationMessage(exception: BadRequestException): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const msg = (response as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg[0] ?? 'تحقّق من صحّة المدخلات.';
      if (typeof msg === 'string') return msg;
    }
    return 'تحقّق من صحّة المدخلات.';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- global-exception`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/common/filters
git commit -m "feat: add GlobalExceptionFilter normalizing errors to ErrorEnvelope"
```

---

### Task 3: Prisma schema migration (refreshTokenHash, soft-delete columns)

**Files:**
- Modify: `prisma/schema.prisma` (add fields to `User` and `Tenant`)
- Create: `prisma/migrations/<ts>_phase3_auth_tenant/migration.sql` (generated by Prisma)
- Modify: `.env.example` (add Phase 3 env vars)

**Interfaces:**
- Produces: `User.refreshTokenHash String?`, `User.deletedAt DateTime?`, `Tenant.deletedAt DateTime?`, `Tenant.purgeAfter DateTime?` on the existing Sprint 0 tables; regenerated Prisma client.
- Consumes: existing Sprint 0 schema (`passwordHash`, `AccountProfile.tenantId`, all `Subscription` fields already present).

- [ ] **Step 1: Add the new fields to `User` in `prisma/schema.prisma`**

Add the two new lines (`refreshTokenHash`, `deletedAt`) to the existing `User` model — keep all Sprint 0 fields:

```prisma
model User {
  id               String    @id @default(cuid())
  tenantId         String
  email            String    @unique
  passwordHash     String
  name             String?
  refreshTokenHash String?   // hash of the currently-valid refresh token (rotation)
  deletedAt        DateTime? // soft-delete marker (PDPL)
  createdAt        DateTime  @default(now())
  tenant           Tenant    @relation(fields: [tenantId], references: [id])
  @@index([tenantId])
}
```

- [ ] **Step 2: Add the new fields to `Tenant` in `prisma/schema.prisma`**

Add `deletedAt` and `purgeAfter` to the existing `Tenant` model — keep all Sprint 0 fields and relations:

```prisma
model Tenant {
  id        String    @id @default(cuid())
  name      String
  deletedAt DateTime? // soft-delete marker (PDPL)
  purgeAfter DateTime? // scheduled hard-delete time (PDPL purge)
  createdAt DateTime  @default(now())
  users         User[]
  brandProfiles BrandProfile[]
  subscriptions Subscription[]
  usageRecords  UsageRecord[]
}
```

- [ ] **Step 3: Add Phase 3 env vars to `.env.example`**

Append:

```
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
TRIAL_DURATION_DAYS=7
PURGE_RETENTION_DAYS=30
```

- [ ] **Step 4: Create the migration and regenerate the client**

Run: `npx prisma migrate dev --name phase3_auth_tenant`
Expected: a new migration directory under `prisma/migrations/` is created and applied; client regenerated; no errors. (LR-004: this is a NEW migration — never edit the Sprint 0 `init` migration.)

- [ ] **Step 5: Verify the schema compiles and typecheck passes**

Run: `npx prisma validate && npm run typecheck`
Expected: schema valid; no type errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/ .env.example
git commit -m "feat: add phase3 migration for refresh token hash and soft-delete columns"
```

---

### Task 4: PasswordService (argon2id hash + verify)

**Files:**
- Create: `src/auth/password.service.ts`
- Test: `src/auth/password.service.spec.ts`

**Interfaces:**
- Produces: `@Injectable() class PasswordService` with `hash(plain: string): Promise<string>` and `verify(hash: string, plain: string): Promise<boolean>`. Uses `argon2id`.

- [ ] **Step 1: Install argon2**

```bash
npm i argon2
```

- [ ] **Step 2: Write the failing test**

```ts
// src/auth/password.service.spec.ts
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('produces an argon2id hash distinct from the plaintext', async () => {
    const hash = await svc.hash('s3cret-passw0rd');
    expect(hash).not.toBe('s3cret-passw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verify returns true for the correct password', async () => {
    const hash = await svc.hash('s3cret-passw0rd');
    await expect(svc.verify(hash, 's3cret-passw0rd')).resolves.toBe(true);
  });

  it('verify returns false for a wrong password', async () => {
    const hash = await svc.hash('s3cret-passw0rd');
    await expect(svc.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('verify returns false (never throws) on a malformed hash', async () => {
    await expect(svc.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- password.service`
Expected: FAIL — cannot find module `./password.service`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/auth/password.service.ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed/unknown hash -> treat as a failed verification, never throw.
      return false;
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- password.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/password.service.ts src/auth/password.service.spec.ts package.json package-lock.json
git commit -m "feat: add PasswordService with argon2id hashing"
```

---

### Task 5: Auth types + TokenService (sign/verify access + refresh)

**Files:**
- Create: `src/auth/auth.types.ts`
- Create: `src/auth/token.service.ts`
- Test: `src/auth/token.service.spec.ts`

**Interfaces:**
- Produces:
  - `interface JwtPayload { sub: string; tenantId: string; type: 'access' | 'refresh'; iat: number; exp: number }`
  - `interface AuthTokens { accessToken: string; refreshToken: string; tokenType: 'Bearer'; expiresIn: number }`
  - `@Injectable() class TokenService`:
    - `issueTokens(userId: string, tenantId: string): Promise<AuthTokens>` — signs access (`type:'access'`, TTL `JWT_ACCESS_TTL`, secret `JWT_ACCESS_SECRET`) and refresh (`type:'refresh'`, TTL `JWT_REFRESH_TTL`, secret `JWT_REFRESH_SECRET`); `expiresIn` is the access TTL in seconds.
    - `verifyAccess(token: string): Promise<JwtPayload>` — verifies signature/expiry with access secret; throws `tokenExpired()` on expiry, `unauthenticated()` otherwise.
    - `verifyRefresh(token: string): Promise<JwtPayload>` — verifies with refresh secret; throws `tokenExpired()` on expiry, `invalidRefreshToken()` otherwise; rejects tokens whose `type !== 'refresh'`.
- Consumes: `@nestjs/jwt` `JwtService`; `@nestjs/config` `ConfigService`; `tokenExpired`, `unauthenticated`, `invalidRefreshToken` (Task 1).

- [ ] **Step 1: Install jwt + passport deps**

```bash
npm i @nestjs/jwt @nestjs/passport passport passport-jwt
npm i -D @types/passport-jwt
```

- [ ] **Step 2: Write the failing test**

```ts
// src/auth/token.service.spec.ts
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

function makeService(): TokenService {
  const config = {
    get: (key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      };
      return map[key];
    },
  } as unknown as ConfigService;
  return new TokenService(new JwtService({}), config);
}

describe('TokenService', () => {
  const svc = makeService();

  it('issues a Bearer access+refresh pair with numeric expiresIn', async () => {
    const tokens = await svc.issueTokens('user-1', 'tenant-1');
    expect(tokens.tokenType).toBe('Bearer');
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
    expect(tokens.expiresIn).toBe(900); // 15m in seconds
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
  });

  it('verifyAccess returns the payload for a valid access token', async () => {
    const { accessToken } = await svc.issueTokens('user-1', 'tenant-1');
    const payload = await svc.verifyAccess(accessToken);
    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.type).toBe('access');
  });

  it('verifyRefresh returns payload for a refresh token, rejects an access token', async () => {
    const { accessToken, refreshToken } = await svc.issueTokens('user-1', 'tenant-1');
    const payload = await svc.verifyRefresh(refreshToken);
    expect(payload.type).toBe('refresh');
    await expect(svc.verifyRefresh(accessToken)).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('verifyAccess throws UNAUTHENTICATED on a garbage token', async () => {
    await expect(svc.verifyAccess('garbage')).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- token.service`
Expected: FAIL — cannot find module `./token.service`.

- [ ] **Step 4: Write `src/auth/auth.types.ts`**

```ts
// src/auth/auth.types.ts
export interface JwtPayload {
  sub: string; // userId
  tenantId: string; // tenant scope — the single source of isolation truth
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // access-token lifetime in seconds
}
```

- [ ] **Step 5: Write `src/auth/token.service.ts`**

```ts
// src/auth/token.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthTokens, JwtPayload } from './auth.types';
import { invalidRefreshToken, tokenExpired, unauthenticated } from '../common/errors/error-envelope';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueTokens(userId: string, tenantId: string): Promise<AuthTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';

    const accessToken = await this.jwt.signAsync(
      { sub: userId, tenantId, type: 'access' },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tenantId, type: 'refresh' },
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: refreshTtl },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.ttlToSeconds(accessTtl),
    };
  }

  async verifyAccess(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access') throw unauthenticated();
      return payload;
    } catch (err) {
      if (err instanceof TokenExpiredError) throw tokenExpired();
      throw unauthenticated();
    }
  }

  async verifyRefresh(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh') throw invalidRefreshToken();
      return payload;
    } catch (err) {
      if (err instanceof TokenExpiredError) throw tokenExpired();
      throw invalidRefreshToken();
    }
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return Number(ttl) || 0;
    const value = Number(match[1]);
    const unit = match[2];
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
    return value * factor;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- token.service`
Expected: PASS.

> Note: when `verifyRefresh` is given an access token signed with a different secret, signature verification fails first and yields `INVALID_REFRESH_TOKEN` — matching the test assertion. The `type !== 'refresh'` guard covers the case where both secrets happen to match in a misconfigured env.

- [ ] **Step 7: Commit**

```bash
git add src/auth/auth.types.ts src/auth/token.service.ts src/auth/token.service.spec.ts package.json package-lock.json
git commit -m "feat: add JWT TokenService and auth token types"
```

---

### Task 6: Auth DTOs (Register / Login / Refresh)

**Files:**
- Create: `src/auth/dto/register.dto.ts`
- Create: `src/auth/dto/login.dto.ts`
- Create: `src/auth/dto/refresh.dto.ts`
- Test: `src/auth/dto/register.dto.spec.ts`

**Interfaces:**
- Produces:
  - `class RegisterDto { tenantName: string; email: string; password: string; name?: string }` — `@IsNotEmpty` tenantName, `@IsEmail` email, `@MinLength(8)` password, `@IsOptional @IsString` name.
  - `class LoginDto { email: string; password: string }` — `@IsEmail` email, `@IsNotEmpty` password.
  - `class RefreshDto { refreshToken: string }` — `@IsJWT` refreshToken.
- Consumes: `class-validator`, `class-transformer` (validated by the global `ValidationPipe` wired in Task 13).

- [ ] **Step 1: Install validation deps (if not already present)**

```bash
npm i class-validator class-transformer
```

- [ ] **Step 2: Write the failing test**

```ts
// src/auth/dto/register.dto.spec.ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';
import { RefreshDto } from './refresh.dto';

describe('auth DTOs', () => {
  it('RegisterDto rejects bad email and short password', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'not-an-email',
      password: 'short',
    });
    const errors = validateSync(dto);
    const props = errors.map((e) => e.property).sort();
    expect(props).toEqual(['email', 'password']);
  });

  it('RegisterDto accepts a valid payload (name optional)', () => {
    const dto = plainToInstance(RegisterDto, {
      tenantName: 'Acme',
      email: 'founder@acme.com',
      password: 'longenough',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('LoginDto requires email and a non-empty password', () => {
    const dto = plainToInstance(LoginDto, { email: 'x', password: '' });
    const props = validateSync(dto).map((e) => e.property).sort();
    expect(props).toEqual(['email', 'password']);
  });

  it('RefreshDto requires a JWT-shaped token', () => {
    const bad = plainToInstance(RefreshDto, { refreshToken: 'nope' });
    expect(validateSync(bad)).toHaveLength(1);
    const good = plainToInstance(RefreshDto, {
      refreshToken: 'aaaa.bbbb.cccc'.replace(/[^.]/g, 'a'),
    });
    // a structurally JWT-like string (three base64url segments)
    const ok = plainToInstance(RefreshDto, {
      refreshToken:
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ25hdHVyZXZhbHVlMTIz',
    });
    expect(validateSync(ok)).toHaveLength(0);
    expect(bad).toBeDefined();
    expect(good).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- register.dto`
Expected: FAIL — cannot find module `./register.dto`.

- [ ] **Step 4: Write the three DTOs**

```ts
// src/auth/dto/register.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  tenantName!: string;

  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
```

```ts
// src/auth/dto/login.dto.ts
import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;
}
```

```ts
// src/auth/dto/refresh.dto.ts
import { IsJWT } from 'class-validator';

export class RefreshDto {
  @IsJWT()
  refreshToken!: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- register.dto`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/dto package.json package-lock.json
git commit -m "feat: add auth DTOs with class-validator rules"
```

---

### Task 7: AuthService (register / login / refresh with rotation)

**Files:**
- Create: `src/auth/auth.service.ts`
- Test: `src/auth/auth.service.spec.ts`

**Interfaces:**
- Produces: `@Injectable() class AuthService`:
  - `register(dto: RegisterDto): Promise<AuthTokens>` — checks email uniqueness (else `emailAlreadyExists()`), hashes password, runs an ATOMIC `prisma.$transaction` creating `Tenant` + `User` + `Subscription { status: 'trialing', plan: 'trial', trialEndsAt: now + TRIAL_DURATION_DAYS }`, then issues tokens, stores the refresh-token hash on the user, returns `AuthTokens`.
  - `login(dto: LoginDto): Promise<AuthTokens>` — finds the user (non-deleted) by email; on missing user OR wrong password throws `invalidCredentials()` (identical error, no existence leak); issues + stores tokens.
  - `refresh(dto: RefreshDto): Promise<AuthTokens>` — verifies the refresh token, loads the user, compares the presented refresh token's hash against the stored `refreshTokenHash` (rotation: a superseded token is rejected with `invalidRefreshToken()`), issues a NEW pair, stores the new refresh hash, returns it.
- Consumes: `PrismaService` (Sprint 0), `PasswordService` (Task 4), `TokenService` (Task 5), `ConfigService`, `AuthTokens` (Task 5), DTOs (Task 6), `emailAlreadyExists/invalidCredentials/invalidRefreshToken` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// src/auth/auth.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

type Row = Record<string, any>;

function makePrismaMock() {
  const users: Row[] = [];
  const tenants: Row[] = [];
  const subscriptions: Row[] = [];
  const tx = {
    tenant: { create: async ({ data }: any) => { const t = { id: 't' + (tenants.length + 1), ...data }; tenants.push(t); return t; } },
    user: { create: async ({ data }: any) => { const u = { id: 'u' + (users.length + 1), ...data }; users.push(u); return u; } },
    subscription: { create: async ({ data }: any) => { const s = { id: 's' + (subscriptions.length + 1), ...data }; subscriptions.push(s); return s; } },
  };
  return {
    users,
    tenants,
    subscriptions,
    user: {
      findFirst: async ({ where }: any) =>
        users.find(
          (u) =>
            (where.email === undefined || u.email === where.email) &&
            (where.id === undefined || u.id === where.id) &&
            (where.deletedAt === undefined || u.deletedAt == null),
        ) ?? null,
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id);
        Object.assign(u, data);
        return u;
      },
    },
    $transaction: async (fn: any) => fn(tx),
  };
}

function makeService(prisma: any) {
  const config = {
    get: (k: string) => ({ TRIAL_DURATION_DAYS: '7', JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'r', JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '7d' }[k]),
  } as unknown as ConfigService;
  const passwords = new PasswordService();
  // Lightweight token service double with rotation-relevant behavior.
  const tokens = {
    issueTokens: jest.fn(async (sub: string, tenantId: string) => ({
      accessToken: `acc.${sub}.${tenantId}`,
      refreshToken: `ref.${sub}.${Math.random()}`,
      tokenType: 'Bearer' as const,
      expiresIn: 900,
    })),
    verifyRefresh: jest.fn(async (t: string) => {
      const [, sub] = t.split('.');
      return { sub, tenantId: 'tenant-1', type: 'refresh', iat: 0, exp: 0 };
    }),
  };
  return { svc: new AuthService(prisma, passwords, tokens as any, config), tokens, passwords };
}

describe('AuthService', () => {
  it('register creates tenant+user+subscription atomically and returns tokens', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    const out = await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    expect(out.tokenType).toBe('Bearer');
    expect(prisma.tenants).toHaveLength(1);
    expect(prisma.users).toHaveLength(1);
    expect(prisma.subscriptions).toHaveLength(1);
    expect(prisma.subscriptions[0].status).toBe('trialing');
    expect(prisma.subscriptions[0].trialEndsAt).toBeInstanceOf(Date);
    expect(prisma.users[0].passwordHash).not.toBe('longpass1');
  });

  it('register with an existing email throws EMAIL_ALREADY_EXISTS and creates nothing', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({ tenantName: 'Acme', email: 'dup@b.com', password: 'longpass1' });
    const before = prisma.users.length;
    await expect(
      svc.register({ tenantName: 'X', email: 'dup@b.com', password: 'longpass1' }),
    ).rejects.toMatchObject({ response: { error: 'EMAIL_ALREADY_EXISTS' } });
    expect(prisma.users).toHaveLength(before);
  });

  it('login returns tokens for valid credentials', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    const out = await svc.login({ email: 'a@b.com', password: 'longpass1' });
    expect(out.accessToken).toContain('acc.');
  });

  it('login with a wrong password throws INVALID_CREDENTIALS', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    await expect(svc.login({ email: 'a@b.com', password: 'WRONG' })).rejects.toMatchObject({
      response: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('login with an unknown email throws the same INVALID_CREDENTIALS', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await expect(svc.login({ email: 'ghost@b.com', password: 'x' })).rejects.toMatchObject({
      response: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('refresh rotates: the old refresh token is rejected after a refresh', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    const first = await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    const rotated = await svc.refresh({ refreshToken: first.refreshToken });
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    // reusing the now-superseded token fails
    await expect(svc.refresh({ refreshToken: first.refreshToken })).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH_TOKEN' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth.service`
Expected: FAIL — cannot find module `./auth.service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthTokens } from './auth.types';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import {
  emailAlreadyExists,
  invalidCredentials,
  invalidRefreshToken,
} from '../common/errors/error-envelope';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw emailAlreadyExists();

    const passwordHash = await this.passwords.hash(dto.password);
    const trialDays = Number(this.config.get<string>('TRIAL_DURATION_DAYS') ?? '7');
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: dto.tenantName } });
      const created = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.name ?? null,
          passwordHash,
        },
      });
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          status: 'trialing',
          plan: 'trial',
          trialEndsAt,
        },
      });
      return created;
    });

    return this.issueAndStore(user.id, user.tenantId);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (!user) throw invalidCredentials();

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) throw invalidCredentials();

    return this.issueAndStore(user.id, user.tenantId);
  }

  async refresh(dto: RefreshDto): Promise<AuthTokens> {
    const payload = await this.tokens.verifyRefresh(dto.refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || !user.refreshTokenHash) throw invalidRefreshToken();

    // Rotation check: the presented token must match the currently-stored one.
    const matches = await this.passwords.verify(user.refreshTokenHash, dto.refreshToken);
    if (!matches) throw invalidRefreshToken();

    return this.issueAndStore(user.id, user.tenantId);
  }

  private async issueAndStore(userId: string, tenantId: string): Promise<AuthTokens> {
    const tokens = await this.tokens.issueTokens(userId, tenantId);
    const refreshTokenHash = await this.passwords.hash(tokens.refreshToken);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } });
    return tokens;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "feat: add AuthService with atomic register, login and refresh rotation"
```

---

### Task 8: AuthController + AuthModule

**Files:**
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/auth.module.ts`
- Test: `src/auth/auth.controller.spec.ts`

**Interfaces:**
- Produces:
  - `@Controller('auth') class AuthController` — `POST register` (`@HttpCode(201)`), `POST login` (`@HttpCode(200)`), `POST refresh` (`@HttpCode(200)`), each delegating to `AuthService` and returning `AuthTokens`.
  - `@Module class AuthModule` — imports `JwtModule.register({})`, `ConfigModule`; providers `AuthService, PasswordService, TokenService`; exports `TokenService, PasswordService` (consumed by `TenantModule`'s `JwtAuthGuard` and any later phase).
- Consumes: `AuthService` (Task 7), DTOs (Task 6), `AuthTokens` (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// src/auth/auth.controller.spec.ts
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer' as const, expiresIn: 900 };
  const service = {
    register: jest.fn(async () => tokens),
    login: jest.fn(async () => tokens),
    refresh: jest.fn(async () => tokens),
  };
  const ctrl = new AuthController(service as any);

  it('register delegates to the service', async () => {
    const dto = { tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' };
    await expect(ctrl.register(dto as any)).resolves.toBe(tokens);
    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('login delegates to the service', async () => {
    await expect(ctrl.login({ email: 'a@b.com', password: 'x' } as any)).resolves.toBe(tokens);
  });

  it('refresh delegates to the service', async () => {
    await expect(ctrl.refresh({ refreshToken: 'r' } as any)).resolves.toBe(tokens);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth.controller`
Expected: FAIL — cannot find module `./auth.controller`.

- [ ] **Step 3: Write the controller**

```ts
// src/auth/auth.controller.ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthTokens } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto);
  }
}
```

- [ ] **Step 4: Write the module**

```ts
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({}), ConfigModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- auth.controller`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.module.ts src/auth/auth.controller.spec.ts
git commit -m "feat: add AuthController and AuthModule"
```

---

### Task 9: TenantContext + @CurrentTenant() + JwtAuthGuard + TenantGuard + TenantModule

**Files:**
- Create: `src/tenant/tenant-context.ts`
- Create: `src/tenant/current-tenant.decorator.ts`
- Create: `src/tenant/jwt-auth.guard.ts`
- Create: `src/tenant/tenant.guard.ts`
- Create: `src/tenant/tenant.module.ts`
- Test: `src/tenant/jwt-auth.guard.spec.ts`
- Test: `src/tenant/tenant.guard.spec.ts`

**Interfaces:**
- Produces (canonical contract consumed by every authenticated route in this and later phases):
  - `interface TenantContext { userId: string; tenantId: string }`
  - `const CurrentTenant = createParamDecorator(...)` — reads `request.tenantContext`, never the body/query.
  - `@Injectable() class JwtAuthGuard implements CanActivate` — extracts `Authorization: Bearer <token>` (else `unauthenticated()`), verifies via `TokenService.verifyAccess`, attaches `request.tenantContext = { userId: payload.sub, tenantId: payload.tenantId }`, returns `true`.
  - `@Injectable() class TenantGuard implements CanActivate` — asserts `request.tenantContext?.tenantId` is present (else `unauthenticated()`), returns `true`.
  - `@Module class TenantModule` — imports `AuthModule` (for `TokenService`); providers + exports `JwtAuthGuard, TenantGuard`.
- Consumes: `TokenService` (Task 8 export), `unauthenticated` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
// src/tenant/jwt-auth.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxWithHeader(authorization?: string) {
  const request: any = { headers: authorization ? { authorization } : {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe('JwtAuthGuard', () => {
  it('rejects a request with no Authorization header (UNAUTHENTICATED)', async () => {
    const tokenSvc = { verifyAccess: jest.fn() };
    const guard = new JwtAuthGuard(tokenSvc as any);
    const { context } = ctxWithHeader(undefined);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });

  it('attaches tenantContext from a verified access token', async () => {
    const tokenSvc = {
      verifyAccess: jest.fn(async () => ({ sub: 'u1', tenantId: 't1', type: 'access' })),
    };
    const guard = new JwtAuthGuard(tokenSvc as any);
    const { request, context } = ctxWithHeader('Bearer good.token.here');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.tenantContext).toEqual({ userId: 'u1', tenantId: 't1' });
    expect(tokenSvc.verifyAccess).toHaveBeenCalledWith('good.token.here');
  });

  it('propagates TOKEN_EXPIRED from the token service', async () => {
    const tokenSvc = {
      verifyAccess: jest.fn(async () => {
        throw { response: { error: 'TOKEN_EXPIRED' } };
      }),
    };
    const guard = new JwtAuthGuard(tokenSvc as any);
    const { context } = ctxWithHeader('Bearer expired');
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { error: 'TOKEN_EXPIRED' },
    });
  });
});
```

```ts
// src/tenant/tenant.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

function ctx(tenantContext?: unknown) {
  const request: any = { tenantContext };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  const guard = new TenantGuard();

  it('passes when a tenantId is present in context', () => {
    expect(guard.canActivate(ctx({ userId: 'u1', tenantId: 't1' }))).toBe(true);
  });

  it('rejects when context is missing (UNAUTHENTICATED)', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(
      expect.objectContaining({ response: { error: 'UNAUTHENTICATED' } }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tenant`
Expected: FAIL — cannot find `./jwt-auth.guard` / `./tenant.guard`.

- [ ] **Step 3: Write `tenant-context.ts`**

```ts
// src/tenant/tenant-context.ts
// Canonical isolation contract — consumed by every authenticated route and every later phase.
export interface TenantContext {
  userId: string;
  tenantId: string;
}
```

- [ ] **Step 4: Write `current-tenant.decorator.ts`**

```ts
// src/tenant/current-tenant.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from './tenant-context';

// Reads the tenant scope ONLY from the verified request context — never from body/query.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<{ tenantContext: TenantContext }>();
    return request.tenantContext;
  },
);
```

- [ ] **Step 5: Write `jwt-auth.guard.ts`**

```ts
// src/tenant/jwt-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TokenService } from '../auth/token.service';
import { TenantContext } from './tenant-context';
import { unauthenticated } from '../common/errors/error-envelope';

interface AuthedRequest {
  headers: { authorization?: string };
  tenantContext?: TenantContext;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthenticated();

    const token = header.slice('Bearer '.length).trim();
    const payload = await this.tokens.verifyAccess(token);
    request.tenantContext = { userId: payload.sub, tenantId: payload.tenantId };
    return true;
  }
}
```

- [ ] **Step 6: Write `tenant.guard.ts`**

```ts
// src/tenant/tenant.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TenantContext } from './tenant-context';
import { unauthenticated } from '../common/errors/error-envelope';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ tenantContext?: TenantContext }>();
    if (!request.tenantContext?.tenantId) throw unauthenticated();
    return true;
  }
}
```

- [ ] **Step 7: Write `tenant.module.ts`**

```ts
// src/tenant/tenant.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';

@Module({
  imports: [AuthModule],
  providers: [JwtAuthGuard, TenantGuard],
  exports: [JwtAuthGuard, TenantGuard],
})
export class TenantModule {}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tenant`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/tenant
git commit -m "feat: add TenantContext, CurrentTenant decorator, JwtAuthGuard, TenantGuard, TenantModule"
```

---

### Task 10: Prisma tenant-scope client extension (second line of defense)

**Files:**
- Create: `src/prisma/tenant-scope.extension.ts`
- Test: `src/prisma/tenant-scope.extension.spec.ts`

**Interfaces:**
- Produces: `function forTenant(prisma: PrismaService, tenantId: string)` — returns a tenant-scoped Prisma client (via `prisma.$extends`) where, for the isolatable models (`AccountProfile`, `Post`, `BrandProfile`, `User`, `Subscription`, `UsageRecord`), every `findMany/findFirst/updateMany/deleteMany/count` query gets `where.tenantId` forced to `tenantId`, and every `create` gets `data.tenantId` forced to `tenantId`. A caller-supplied conflicting `tenantId` is overwritten (cannot be forged).
- Consumes: `PrismaService` (Sprint 0).

> This is the spec's recommended Prisma Client Extension (section 6.3): a defensive layer so that even if a developer forgets a manual `tenantId` filter, queries stay scoped. Account-profile CRUD (Task 12) uses it.

- [ ] **Step 1: Write the failing test**

```ts
// src/prisma/tenant-scope.extension.spec.ts
import { forTenant } from './tenant-scope.extension';

// Minimal fake mimicking the $extends query hook contract.
function makeFakePrisma(capture: { args: any; model?: string; operation?: string }) {
  return {
    $extends: (ext: any) => {
      const queryHook = ext.query.$allModels.$allOperations;
      return {
        accountProfile: {
          findMany: (args: any) =>
            queryHook({
              model: 'AccountProfile',
              operation: 'findMany',
              args,
              query: (finalArgs: any) => {
                capture.args = finalArgs;
                capture.model = 'AccountProfile';
                capture.operation = 'findMany';
                return finalArgs;
              },
            }),
          create: (args: any) =>
            queryHook({
              model: 'AccountProfile',
              operation: 'create',
              args,
              query: (finalArgs: any) => {
                capture.args = finalArgs;
                return finalArgs;
              },
            }),
        },
      };
    },
  };
}

describe('tenant-scope extension', () => {
  it('forces tenantId into the where clause of a read', async () => {
    const capture: any = {};
    const scoped = forTenant(makeFakePrisma(capture) as any, 'tenant-1');
    await scoped.accountProfile.findMany({ where: { handle: 'x' } });
    expect(capture.args.where).toEqual({ handle: 'x', tenantId: 'tenant-1' });
  });

  it('overwrites a forged tenantId in the where clause', async () => {
    const capture: any = {};
    const scoped = forTenant(makeFakePrisma(capture) as any, 'tenant-1');
    await scoped.accountProfile.findMany({ where: { tenantId: 'tenant-EVIL' } });
    expect(capture.args.where.tenantId).toBe('tenant-1');
  });

  it('forces tenantId into create data', async () => {
    const capture: any = {};
    const scoped = forTenant(makeFakePrisma(capture) as any, 'tenant-1');
    await scoped.accountProfile.create({ data: { platform: 'x', tenantId: 'tenant-EVIL' } });
    expect(capture.args.data.tenantId).toBe('tenant-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tenant-scope`
Expected: FAIL — cannot find module `./tenant-scope.extension`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/prisma/tenant-scope.extension.ts
import { PrismaService } from './prisma.service';

// Models that carry tenantId and must always be scoped.
const SCOPED_MODELS = new Set([
  'AccountProfile',
  'Post',
  'BrandProfile',
  'User',
  'Subscription',
  'UsageRecord',
]);

const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
]);

const CREATE_OPS = new Set(['create']);

export function forTenant(prisma: PrismaService, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          if (!SCOPED_MODELS.has(model)) return query(args);

          if (WHERE_OPS.has(operation)) {
            args.where = { ...(args.where ?? {}), tenantId };
          } else if (CREATE_OPS.has(operation)) {
            args.data = { ...(args.data ?? {}), tenantId };
          }
          return query(args);
        },
      },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tenant-scope`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prisma/tenant-scope.extension.ts src/prisma/tenant-scope.extension.spec.ts
git commit -m "feat: add Prisma tenant-scope client extension for scope-leakage defense"
```

---

### Task 11: AccountProfile DTOs + AccountProfileService (tenant-scoped CRUD)

**Files:**
- Create: `src/accounts/dto/create-account-profile.dto.ts`
- Create: `src/accounts/dto/update-account-profile.dto.ts`
- Create: `src/accounts/account-profile.service.ts`
- Test: `src/accounts/account-profile.service.spec.ts`

**Interfaces:**
- Produces:
  - `class CreateAccountProfileDto { brandProfileId: string; platform: 'linkedin' | 'x'; handle?: string }` — `@IsNotEmpty` brandProfileId, `@IsIn(['linkedin','x'])` platform, `@IsOptional @IsString` handle.
  - `class UpdateAccountProfileDto { handle?: string }` — `@IsOptional @IsString` handle. (`platform` is immutable after creation — not accepted.)
  - `@Injectable() class AccountProfileService`:
    - `listForTenant(tenantId: string): Promise<AccountProfile[]>`
    - `createForTenant(tenantId: string, dto: CreateAccountProfileDto): Promise<AccountProfile>` — `tenantId` injected from context, never from the DTO.
    - `updateForTenant(tenantId: string, id: string, dto: UpdateAccountProfileDto): Promise<AccountProfile>` — `where: { id, tenantId }`; throws `accountNotFound()` (404) when no row in scope.
    - `deleteForTenant(tenantId: string, id: string): Promise<void>` — `where: { id, tenantId }`; throws `accountNotFound()` when out of scope.
- Consumes: `PrismaService` (Sprint 0), `accountNotFound` (Task 1). (Direct `where: { id, tenantId }` is used here — explicit isolation; the Task 10 extension is the backstop.)

- [ ] **Step 1: Write the failing test**

```ts
// src/accounts/account-profile.service.spec.ts
import { AccountProfileService } from './account-profile.service';

type Row = Record<string, any>;

function makePrismaMock(seed: Row[] = []) {
  const rows = [...seed];
  return {
    rows,
    accountProfile: {
      findMany: async ({ where }: any) => rows.filter((r) => r.tenantId === where.tenantId),
      create: async ({ data }: any) => {
        const row = { id: 'ap' + (rows.length + 1), ...data };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id && r.tenantId === where.tenantId);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = rows.findIndex((r) => r.id === where.id && r.tenantId === where.tenantId);
        const [removed] = rows.splice(idx, 1);
        return removed;
      },
    },
  };
}

describe('AccountProfileService', () => {
  it('lists only the current tenant rows', async () => {
    const prisma = makePrismaMock([
      { id: 'a', tenantId: 't1', platform: 'x' },
      { id: 'b', tenantId: 't2', platform: 'x' },
    ]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.listForTenant('t1');
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('create injects tenantId from context, ignoring any DTO tenantId', async () => {
    const prisma = makePrismaMock();
    const svc = new AccountProfileService(prisma as any);
    const created = await svc.createForTenant('t1', {
      brandProfileId: 'bp1',
      platform: 'linkedin',
      // a forged tenantId here must NOT win
      tenantId: 't-EVIL',
    } as any);
    expect(created.tenantId).toBe('t1');
  });

  it('update of a row in scope succeeds', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.updateForTenant('t1', 'a', { handle: 'new' });
    expect(out.handle).toBe('new');
  });

  it('update of another tenant row throws ACCOUNT_NOT_FOUND (404, not 403)', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't2', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.updateForTenant('t1', 'a', { handle: 'x' })).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('delete of another tenant row throws ACCOUNT_NOT_FOUND', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't2' }]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.deleteForTenant('t1', 'a')).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('delete of a row in scope removes it', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1' }]);
    const svc = new AccountProfileService(prisma as any);
    await svc.deleteForTenant('t1', 'a');
    expect(prisma.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- account-profile.service`
Expected: FAIL — cannot find module `./account-profile.service`.

- [ ] **Step 3: Write the DTOs**

```ts
// src/accounts/dto/create-account-profile.dto.ts
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAccountProfileDto {
  @IsNotEmpty()
  @IsString()
  brandProfileId!: string;

  @IsIn(['linkedin', 'x'])
  platform!: 'linkedin' | 'x';

  @IsOptional()
  @IsString()
  handle?: string;
}
```

```ts
// src/accounts/dto/update-account-profile.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class UpdateAccountProfileDto {
  // platform is immutable after creation — intentionally not accepted here.
  @IsOptional()
  @IsString()
  handle?: string;
}
```

- [ ] **Step 4: Write the service**

```ts
// src/accounts/account-profile.service.ts
import { Injectable } from '@nestjs/common';
import { AccountProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountProfileDto } from './dto/create-account-profile.dto';
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto';
import { accountNotFound } from '../common/errors/error-envelope';

@Injectable()
export class AccountProfileService {
  constructor(private readonly prisma: PrismaService) {}

  listForTenant(tenantId: string): Promise<AccountProfile[]> {
    return this.prisma.accountProfile.findMany({ where: { tenantId } });
  }

  createForTenant(tenantId: string, dto: CreateAccountProfileDto): Promise<AccountProfile> {
    // tenantId comes ONLY from the verified context; any DTO tenantId is ignored.
    return this.prisma.accountProfile.create({
      data: {
        tenantId,
        brandProfileId: dto.brandProfileId,
        platform: dto.platform,
        handle: dto.handle ?? null,
      },
    });
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateAccountProfileDto,
  ): Promise<AccountProfile> {
    const existing = await this.prisma.accountProfile.findFirst({ where: { id, tenantId } });
    if (!existing) throw accountNotFound();
    return this.prisma.accountProfile.update({
      where: { id, tenantId },
      data: { handle: dto.handle },
    });
  }

  async deleteForTenant(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.accountProfile.findFirst({ where: { id, tenantId } });
    if (!existing) throw accountNotFound();
    await this.prisma.accountProfile.delete({ where: { id, tenantId } });
  }
}
```

> Note: `where: { id, tenantId }` on `update`/`delete` requires a compound unique. If the generated Prisma client does not expose `id_tenantId` as a unique selector, switch these two calls to `updateMany`/`deleteMany` with `where: { id, tenantId }` (the preceding `findFirst` guard already enforces 404). The mock above models the strict-scope behavior either way.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- account-profile.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/accounts/dto src/accounts/account-profile.service.ts src/accounts/account-profile.service.spec.ts
git commit -m "feat: add AccountProfile DTOs and tenant-scoped CRUD service"
```

---

### Task 12: AccountProfileController + AccountProfileModule

**Files:**
- Create: `src/accounts/account-profile.controller.ts`
- Create: `src/accounts/account-profile.module.ts`
- Test: `src/accounts/account-profile.controller.spec.ts`

**Interfaces:**
- Produces:
  - `@Controller('accounts') @UseGuards(JwtAuthGuard, TenantGuard) class AccountProfileController` — `GET ''` (list), `POST ''` (`@HttpCode(201)` create), `PATCH ':id'` (update), `DELETE ':id'` (`@HttpCode(204)` delete). Each reads scope via `@CurrentTenant() ctx: TenantContext` and passes `ctx.tenantId` to the service.
  - `@Module class AccountProfileModule` — imports `TenantModule`; controller `AccountProfileController`; provider `AccountProfileService`.
- Consumes: `AccountProfileService` (Task 11), `JwtAuthGuard`, `TenantGuard`, `@CurrentTenant`, `TenantContext` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// src/accounts/account-profile.controller.spec.ts
import { AccountProfileController } from './account-profile.controller';

describe('AccountProfileController', () => {
  const ctx = { userId: 'u1', tenantId: 't1' };
  const service = {
    listForTenant: jest.fn(async () => [{ id: 'a' }]),
    createForTenant: jest.fn(async () => ({ id: 'a' })),
    updateForTenant: jest.fn(async () => ({ id: 'a', handle: 'new' })),
    deleteForTenant: jest.fn(async () => undefined),
  };
  const ctrl = new AccountProfileController(service as any);

  it('list passes the tenantId from context', async () => {
    await ctrl.list(ctx as any);
    expect(service.listForTenant).toHaveBeenCalledWith('t1');
  });

  it('create passes the tenantId from context, not the body', async () => {
    const dto = { brandProfileId: 'bp', platform: 'x' };
    await ctrl.create(ctx as any, dto as any);
    expect(service.createForTenant).toHaveBeenCalledWith('t1', dto);
  });

  it('update passes tenantId + id', async () => {
    await ctrl.update(ctx as any, 'a', { handle: 'new' } as any);
    expect(service.updateForTenant).toHaveBeenCalledWith('t1', 'a', { handle: 'new' });
  });

  it('delete passes tenantId + id', async () => {
    await ctrl.remove(ctx as any, 'a');
    expect(service.deleteForTenant).toHaveBeenCalledWith('t1', 'a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- account-profile.controller`
Expected: FAIL — cannot find module `./account-profile.controller`.

- [ ] **Step 3: Write the controller**

```ts
// src/accounts/account-profile.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccountProfileService } from './account-profile.service';
import { CreateAccountProfileDto } from './dto/create-account-profile.dto';
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';

@Controller('accounts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AccountProfileController {
  constructor(private readonly accounts: AccountProfileService) {}

  @Get()
  list(@CurrentTenant() ctx: TenantContext) {
    return this.accounts.listForTenant(ctx.tenantId);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateAccountProfileDto) {
    return this.accounts.createForTenant(ctx.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAccountProfileDto,
  ) {
    return this.accounts.updateForTenant(ctx.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.accounts.deleteForTenant(ctx.tenantId, id);
  }
}
```

- [ ] **Step 4: Write the module**

```ts
// src/accounts/account-profile.module.ts
import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AccountProfileController } from './account-profile.controller';
import { AccountProfileService } from './account-profile.service';

@Module({
  imports: [TenantModule],
  controllers: [AccountProfileController],
  providers: [AccountProfileService],
})
export class AccountProfileModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- account-profile.controller`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/accounts/account-profile.controller.ts src/accounts/account-profile.module.ts src/accounts/account-profile.controller.spec.ts
git commit -m "feat: add AccountProfileController and module with guard-protected CRUD"
```

---

### Task 13: UserService (me / export / soft-delete) + DeleteMeDto

**Files:**
- Create: `src/user/dto/delete-me.dto.ts`
- Create: `src/user/user.service.ts`
- Test: `src/user/user.service.spec.ts`

**Interfaces:**
- Produces:
  - `class DeleteMeDto { confirm: boolean }` — `@IsBoolean` confirm.
  - `@Injectable() class UserService`:
    - `me(ctx: TenantContext): Promise<{ user: { id; email; name }; tenant: { id; name }; subscription: { status; plan; trialEndsAt } | null }>` — loads user (select excludes `passwordHash`/`refreshTokenHash`), tenant, and the latest subscription for the tenant.
    - `exportData(ctx: TenantContext): Promise<{ exportedAt: string; tenant; users; brandProfiles; posts; accountProfiles; subscriptions }>` — every query filtered by `where: { tenantId: ctx.tenantId }`; users selected WITHOUT `passwordHash`/`refreshTokenHash`.
    - `softDelete(ctx: TenantContext, dto: DeleteMeDto): Promise<{ status: 'scheduled_for_deletion'; purgeAfter: string }>` — throws `confirmationRequired()` when `confirm !== true`; otherwise sets `tenant.deletedAt = now`, `tenant.purgeAfter = now + PURGE_RETENTION_DAYS`, nulls all the tenant users' `refreshTokenHash` (session invalidation), returns the schedule.
- Consumes: `PrismaService`, `ConfigService`, `TenantContext` (Task 9), `confirmationRequired` (Task 1).

> The scheduled background purge JOB itself is out of scope per the spec ("تُسلَّم لـbackend/devops"). This task implements the immediate soft-delete + scheduling of `purgeAfter`; the cron worker that hard-deletes rows after `purgeAfter` is a deferred follow-up (see Self-Review).

- [ ] **Step 1: Write the failing test**

```ts
// src/user/user.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';

function makePrismaMock() {
  const tenant = { id: 't1', name: 'Acme', deletedAt: null, purgeAfter: null };
  const users = [{ id: 'u1', tenantId: 't1', email: 'a@b.com', name: 'A', passwordHash: 'H', refreshTokenHash: 'R' }];
  const subscriptions = [{ id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial', trialEndsAt: new Date() }];
  return {
    tenant,
    users,
    subscriptions,
    user: {
      findFirst: async ({ where, select }: any) => {
        const u = users.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        if (!u) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = (u as any)[k];
          return out;
        }
        return u;
      },
      findMany: async ({ where, select }: any) =>
        users
          .filter((u) => u.tenantId === where.tenantId)
          .map((u) => {
            if (!select) return u;
            const out: any = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = (u as any)[k];
            return out;
          }),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const u of users) if (u.tenantId === where.tenantId) { Object.assign(u, data); count++; }
        return { count };
      },
    },
    tenant_: undefined,
    findTenant: undefined,
    subscription: {
      findFirst: async ({ where }: any) =>
        subscriptions.filter((s) => s.tenantId === where.tenantId).slice(-1)[0] ?? null,
      findMany: async ({ where }: any) => subscriptions.filter((s) => s.tenantId === where.tenantId),
    },
    brandProfile: { findMany: async () => [] },
    post: { findMany: async () => [] },
    accountProfile: { findMany: async ({ where }: any) => (where.tenantId === 't1' ? [{ id: 'ap1', tenantId: 't1' }] : []) },
    tenantTable: {
      findFirst: async ({ where }: any) => (tenant.id === where.id ? tenant : null),
      update: async ({ where, data }: any) => { Object.assign(tenant, data); return tenant; },
    },
  };
}

// Bind the tenant delegate name used by the service.
function asPrisma(mock: any) {
  return { ...mock, tenant: { findFirst: mock.tenantTable.findFirst, update: mock.tenantTable.update }, _t: mock.tenant };
}

function makeService(mock: any) {
  const config = { get: (k: string) => ({ PURGE_RETENTION_DAYS: '30' }[k]) } as unknown as ConfigService;
  return new UserService(asPrisma(mock) as any, config);
}

const ctx = { userId: 'u1', tenantId: 't1' };

describe('UserService', () => {
  it('me returns user+tenant+subscription without passwordHash', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    const out = await svc.me(ctx);
    expect(out.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'A' });
    expect((out.user as any).passwordHash).toBeUndefined();
    expect(out.tenant).toEqual({ id: 't1', name: 'Acme' });
    expect(out.subscription).toMatchObject({ status: 'trialing', plan: 'trial' });
  });

  it('exportData returns tenant bundle, users carry no passwordHash', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    const out = await svc.exportData(ctx);
    expect(typeof out.exportedAt).toBe('string');
    expect(out.accountProfiles).toHaveLength(1);
    expect((out.users[0] as any).passwordHash).toBeUndefined();
    expect((out.users[0] as any).refreshTokenHash).toBeUndefined();
  });

  it('softDelete without confirm throws CONFIRMATION_REQUIRED and changes nothing', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    await expect(svc.softDelete(ctx, { confirm: false })).rejects.toMatchObject({
      response: { error: 'CONFIRMATION_REQUIRED' },
    });
    expect(mock.tenant.deletedAt).toBeNull();
  });

  it('softDelete with confirm marks deletedAt, schedules purge, invalidates sessions', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    const out = await svc.softDelete(ctx, { confirm: true });
    expect(out.status).toBe('scheduled_for_deletion');
    expect(typeof out.purgeAfter).toBe('string');
    expect(mock.tenant.deletedAt).toBeInstanceOf(Date);
    expect(mock.users[0].refreshTokenHash).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- user.service`
Expected: FAIL — cannot find module `./user.service`.

- [ ] **Step 3: Write the DeleteMeDto**

```ts
// src/user/dto/delete-me.dto.ts
import { IsBoolean } from 'class-validator';

export class DeleteMeDto {
  @IsBoolean()
  confirm!: boolean;
}
```

- [ ] **Step 4: Write the service**

```ts
// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { confirmationRequired } from '../common/errors/error-envelope';

// Selection that NEVER exposes secret columns.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  tenantId: true,
  createdAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async me(ctx: TenantContext) {
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, email: true, name: true },
    });
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: ctx.tenantId },
      select: { id: true, name: true },
    });
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, plan: true, trialEndsAt: true },
    });
    return { user, tenant, subscription };
  }

  async exportData(ctx: TenantContext) {
    const where = { tenantId: ctx.tenantId };
    const [tenant, users, brandProfiles, posts, accountProfiles, subscriptions] =
      await Promise.all([
        this.prisma.tenant.findFirst({ where: { id: ctx.tenantId }, select: { id: true, name: true } }),
        this.prisma.user.findMany({ where, select: SAFE_USER_SELECT }),
        this.prisma.brandProfile.findMany({ where }),
        this.prisma.post.findMany({ where }),
        this.prisma.accountProfile.findMany({ where }),
        this.prisma.subscription.findMany({ where }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      tenant,
      users,
      brandProfiles,
      posts,
      accountProfiles,
      subscriptions,
    };
  }

  async softDelete(ctx: TenantContext, dto: { confirm: boolean }) {
    if (dto.confirm !== true) throw confirmationRequired();

    const retentionDays = Number(this.config.get<string>('PURGE_RETENTION_DAYS') ?? '30');
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    // Immediate soft-delete: mark tenant + schedule purge.
    await this.prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { deletedAt: now, purgeAfter },
    });
    // Session invalidation: drop every refresh token in the tenant.
    await this.prisma.user.updateMany({
      where: { tenantId: ctx.tenantId },
      data: { refreshTokenHash: null, deletedAt: now },
    });

    return { status: 'scheduled_for_deletion' as const, purgeAfter: purgeAfter.toISOString() };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- user.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/user/dto/delete-me.dto.ts src/user/user.service.ts src/user/user.service.spec.ts
git commit -m "feat: add UserService for me, PDPL export and soft-delete"
```

---

### Task 14: UserController + UserModule (GET /me, POST /me/export, DELETE /me)

**Files:**
- Create: `src/user/user.controller.ts`
- Create: `src/user/user.module.ts`
- Test: `src/user/user.controller.spec.ts`

**Interfaces:**
- Produces:
  - `@Controller('me') @UseGuards(JwtAuthGuard, TenantGuard) class UserController` — `GET ''` → `me`, `POST 'export'` (`@HttpCode(200)`) → `exportData`, `DELETE ''` (`@HttpCode(202)`) → `softDelete`. Scope via `@CurrentTenant()`.
  - `@Module class UserModule` — imports `TenantModule`; controller `UserController`; provider `UserService`.
- Consumes: `UserService`, `DeleteMeDto` (Task 13), guards + decorator (Task 9).

> Route note: with `@Controller('me')`, `GET ''` → `GET /api/v1/me`, `POST 'export'` → `POST /api/v1/me/export`, `DELETE ''` → `DELETE /api/v1/me` — exactly the spec's paths.

- [ ] **Step 1: Write the failing test**

```ts
// src/user/user.controller.spec.ts
import { UserController } from './user.controller';

describe('UserController', () => {
  const ctx = { userId: 'u1', tenantId: 't1' };
  const service = {
    me: jest.fn(async () => ({ user: {}, tenant: {}, subscription: {} })),
    exportData: jest.fn(async () => ({ exportedAt: 'now' })),
    softDelete: jest.fn(async () => ({ status: 'scheduled_for_deletion', purgeAfter: 'later' })),
  };
  const ctrl = new UserController(service as any);

  it('GET me delegates with context', async () => {
    await ctrl.me(ctx as any);
    expect(service.me).toHaveBeenCalledWith(ctx);
  });

  it('POST export delegates with context', async () => {
    await ctrl.export(ctx as any);
    expect(service.exportData).toHaveBeenCalledWith(ctx);
  });

  it('DELETE me delegates context and body', async () => {
    await ctrl.remove(ctx as any, { confirm: true } as any);
    expect(service.softDelete).toHaveBeenCalledWith(ctx, { confirm: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- user.controller`
Expected: FAIL — cannot find module `./user.controller`.

- [ ] **Step 3: Write the controller**

```ts
// src/user/user.controller.ts
import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { DeleteMeDto } from './dto/delete-me.dto';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { TenantContext } from '../tenant/tenant-context';

@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  me(@CurrentTenant() ctx: TenantContext) {
    return this.users.me(ctx);
  }

  @Post('export')
  @HttpCode(200)
  export(@CurrentTenant() ctx: TenantContext) {
    return this.users.exportData(ctx);
  }

  @Delete()
  @HttpCode(202)
  remove(@CurrentTenant() ctx: TenantContext, @Body() dto: DeleteMeDto) {
    return this.users.softDelete(ctx, dto);
  }
}
```

- [ ] **Step 4: Write the module**

```ts
// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TenantModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- user.controller`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/user/user.controller.ts src/user/user.module.ts src/user/user.controller.spec.ts
git commit -m "feat: add UserController and module for me, export and delete"
```

---

### Task 15: Wire app — modules, global ValidationPipe + GlobalExceptionFilter

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`
- Test: `src/app.module.spec.ts`

**Interfaces:**
- Produces: an `AppModule` importing `AuthModule, TenantModule, UserModule, AccountProfileModule` (alongside the Sprint 0 `ConfigModule, PrismaModule, HealthModule`); `main.ts` registers a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` and the `GlobalExceptionFilter`.
- Consumes: every module above; `GlobalExceptionFilter` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// src/app.module.spec.ts
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthController } from './auth/auth.controller';
import { AccountProfileController } from './accounts/account-profile.controller';
import { UserController } from './user/user.controller';

describe('AppModule', () => {
  it('compiles with auth, accounts and user controllers wired', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AuthController)).toBeDefined();
    expect(moduleRef.get(AccountProfileController)).toBeDefined();
    expect(moduleRef.get(UserController)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app.module`
Expected: FAIL — controllers not registered / providers unresolved.

- [ ] **Step 3: Update `src/app.module.ts`**

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { UserModule } from './user/user.module';
import { AccountProfileModule } from './accounts/account-profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantModule,
    UserModule,
    AccountProfileModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Update `src/main.ts`**

```ts
// src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1'); // all routes live under /api/v1 (single source of truth)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `npm test -- app.module && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app.module.ts src/main.ts src/app.module.spec.ts
git commit -m "feat: wire auth/tenant/user/accounts modules with global pipe and filter"
```

---

### Task 16: E2E — auth happy path + token expiry behavior

**Files:**
- Create: `test/jest-e2e.json`
- Create: `test/auth.e2e-spec.ts`
- Modify: `package.json` (add `test:e2e` script)

**Interfaces:**
- Consumes: the full booted app (`AppModule`), a live Postgres (Docker from Sprint 0), `supertest`.
- Produces: end-to-end coverage of `POST /auth/register|login|refresh`, `GET /me`, `POST /me/export`, and `401` on missing token.

- [ ] **Step 1: Install supertest and add the e2e config + script**

```bash
npm i -D supertest @types/supertest
```

`test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

Add to `package.json` scripts:
```json
"test:e2e": "jest --config ./test/jest-e2e.json"
```

- [ ] **Step 2: Write the failing e2e test**

```ts
// test/auth.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@athar.test`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('register -> login -> me -> refresh -> export', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ tenantName: 'E2E Co', email, password: 'longpass1' })
      .expect(201);
    expect(reg.body.accessToken).toBeDefined();
    expect(reg.body.tokenType).toBe('Bearer');

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'longpass1' })
      .expect(200);
    const access = login.body.accessToken as string;

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.passwordHash).toBeUndefined();
    expect(me.body.subscription.status).toBe('trialing');

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    const exported = await request(app.getHttpServer())
      .post('/api/v1/me/export')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(exported.body.users[0].passwordHash).toBeUndefined();
    expect(exported.body.exportedAt).toBeDefined();
  });

  it('register with a duplicate email returns 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ tenantName: 'E2E Co', email, password: 'longpass1' })
      .expect(409);
    expect(res.body.error).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('me without a token returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    expect(res.body.error).toBe('UNAUTHENTICATED');
  });

  it('login with a wrong password returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WRONGWRONG' })
      .expect(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });
});
```

- [ ] **Step 3: Run the e2e test to verify it passes (requires Docker Postgres up + migrations applied)**

Run: `docker compose up -d && npx prisma migrate deploy && npm run test:e2e -- auth`
Expected: PASS for all four cases.

- [ ] **Step 4: Commit**

```bash
git add test/jest-e2e.json test/auth.e2e-spec.ts package.json package-lock.json
git commit -m "test: add auth e2e covering register, login, me, refresh, export"
```

---

### Task 17: E2E — tenant isolation (Tenant A cannot reach Tenant B → 404)

**Files:**
- Create: `test/isolation.e2e-spec.ts`

**Interfaces:**
- Consumes: booted `AppModule`, live Postgres, `supertest`.
- Produces: proof that account-profile reads/updates/deletes across tenants return `404 ACCOUNT_NOT_FOUND` and that lists never leak another tenant's rows.

- [ ] **Step 1: Write the failing e2e test**

```ts
// test/isolation.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailA = `iso-a-${Date.now()}@athar.test`;
  const emailB = `iso-b-${Date.now()}@athar.test`;

  async function registerAndBrand(email: string) {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ tenantName: 'Iso ' + email, email, password: 'longpass1' })
      .expect(201);
    const access = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    const tenantId = me.body.tenant.id as string;
    // A BrandProfile is needed as a CreateAccountProfileDto FK; create one directly.
    const brand = await prisma.brandProfile.create({
      data: {
        tenantId,
        tone: 'neutral',
        topics: [],
        prohibitions: [],
        competitors: [],
        keywords: [],
        brandKit: {},
      },
    });
    return { access, tenantId, brandProfileId: brand.id };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const email of [emailA, emailB]) {
      const user = await prisma.user.findFirst({ where: { email } });
      if (user) {
        await prisma.accountProfile.deleteMany({ where: { tenantId: user.tenantId } });
        await prisma.brandProfile.deleteMany({ where: { tenantId: user.tenantId } });
        await prisma.subscription.deleteMany({ where: { tenantId: user.tenantId } });
        await prisma.user.deleteMany({ where: { tenantId: user.tenantId } });
        await prisma.tenant.deleteMany({ where: { id: user.tenantId } });
      }
    }
    await app.close();
  });

  it('Tenant A cannot read/update/delete Tenant B account profiles (404, not 403)', async () => {
    const a = await registerAndBrand(emailA);
    const b = await registerAndBrand(emailB);

    // B creates an account profile.
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${b.access}`)
      .send({ brandProfileId: b.brandProfileId, platform: 'x', handle: '@b' })
      .expect(201);
    const bAccountId = created.body.id as string;

    // A's list must NOT include B's row.
    const listA = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${a.access}`)
      .expect(200);
    expect(listA.body.find((r: any) => r.id === bAccountId)).toBeUndefined();

    // A patching B's row -> 404 ACCOUNT_NOT_FOUND.
    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${bAccountId}`)
      .set('Authorization', `Bearer ${a.access}`)
      .send({ handle: '@hijack' })
      .expect(404);
    expect(patch.body.error).toBe('ACCOUNT_NOT_FOUND');

    // A deleting B's row -> 404.
    await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${bAccountId}`)
      .set('Authorization', `Bearer ${a.access}`)
      .expect(404);

    // B's row still exists for B.
    const listB = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${b.access}`)
      .expect(200);
    expect(listB.body.find((r: any) => r.id === bAccountId)).toBeDefined();
  });

  it('a forged tenantId in the create body is ignored (scope from JWT only)', async () => {
    const a = await registerAndBrand(emailA + '.2');
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${a.access}`)
      .send({ brandProfileId: a.brandProfileId, platform: 'x', tenantId: 'tenant-EVIL' })
      .expect(201);
    expect(created.body.tenantId).toBe(a.tenantId);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it passes (Docker Postgres up + migrations applied)**

Run: `docker compose up -d && npx prisma migrate deploy && npm run test:e2e -- isolation`
Expected: PASS for both cases.

> Note: the second case sends `tenantId` in the body. Because the global `ValidationPipe` uses `forbidNonWhitelisted: true`, an unknown property normally yields `422`. `CreateAccountProfileDto` has no `tenantId`, so to assert "ignored, not rejected" the controller relies on `whitelist` stripping the extra field BEFORE validation. `whitelist: true` strips non-whitelisted props; `forbidNonWhitelisted: true` would reject them. If you want forged fields silently ignored (the spec's intent — "تجاهل أي tenantId"), set `forbidNonWhitelisted: false` in `main.ts` and Task 16/15. If you prefer strict rejection, change this test to `.expect(422)`. **Decision: keep `forbidNonWhitelisted: true` for safety and assert `422` here** — update the `.expect(201)` to `.expect(422)` and drop the `tenantId` body-echo assertion. Either is spec-compliant (both prevent scope forgery); strict rejection is the stronger guarantee.

- [ ] **Step 3: Apply the decided behavior**

Edit `test/isolation.e2e-spec.ts` second case to the strict form:

```ts
  it('a forged tenantId in the create body is rejected (422) — scope cannot be forged', async () => {
    const a = await registerAndBrand(emailA + '.2');
    await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${a.access}`)
      .send({ brandProfileId: a.brandProfileId, platform: 'x', tenantId: 'tenant-EVIL' })
      .expect(422);
  });
```

- [ ] **Step 4: Run again to verify it passes**

Run: `npm run test:e2e -- isolation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/isolation.e2e-spec.ts
git commit -m "test: add tenant isolation e2e proving cross-tenant access returns 404"
```

---

### Task 18: Final gate — full suite, typecheck, lint

**Files:**
- None (verification task).

**Interfaces:**
- Consumes: everything above.
- Produces: a green build proving the phase is complete.

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all unit specs PASS.

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the e2e suite (Docker Postgres up + migrations applied)**

Run: `docker compose up -d && npx prisma migrate deploy && npm run test:e2e`
Expected: auth + isolation e2e PASS.

- [ ] **Step 4: Commit (only if any lint autofix changed files)**

```bash
git add -A
git commit -m "chore: phase3 final gate — green unit, e2e, typecheck, lint"
```

---

## Self-Review

**1. Spec coverage** — every Acceptance Criterion (section 9) mapped to a task:

| Spec AC | Task(s) |
|---|---|
| `POST /auth/register` atomic Tenant+User+Subscription(trialing, now+7d) → AuthTokens | Task 7 (service, `$transaction`), Task 8 (controller 201), Task 16 (e2e) |
| Duplicate email → 409 EMAIL_ALREADY_EXISTS, creates nothing | Task 1 (error), Task 7 (pre-check before tx), Task 16 (e2e) |
| `POST /auth/login` valid → tokens; invalid → 401 INVALID_CREDENTIALS, no existence leak | Task 7 (identical error for unknown email + wrong password), Task 16 (e2e) |
| `POST /auth/refresh` valid → new pair (rotation); expired/invalid → 401 | Task 5 (verifyRefresh), Task 7 (rotation via stored hash), Task 16 (e2e) |
| `GET /me` valid → user+tenant+subscription; no token → 401; expired → TOKEN_EXPIRED | Task 9 (guard), Task 13/14 (me), Task 5 (TOKEN_EXPIRED), Task 16 (e2e) |
| Password stored as hash, never serialized; no passwordHash in any response | Task 4 (argon2), Task 13 (SAFE_USER_SELECT + select), Task 16 (e2e assertions) |
| `/accounts` CRUD scoped to JWT tenantId | Task 11 (service), Task 12 (controller + guards), Task 17 (e2e) |
| Tenant A cannot read/update/delete Tenant B AccountProfile → 404 (not 403) | Task 11 (accountNotFound), Task 17 (e2e all verbs) |
| `tenantId` never read from body/query — only JWT | Task 9 (@CurrentTenant reads context), Task 10 (Prisma extension), Task 11 (ignores DTO tenantId), Task 17 (forged-body e2e) |
| `POST /me/export` → tenant bundle (users w/o passwordHash, BrandProfile, Posts, AccountProfile, Subscriptions), no foreign rows — NFR-5 export | Task 13 (exportData, per-query `where: { tenantId }`), Task 14 (controller 200), Task 16 (e2e) |
| `DELETE /me` confirm:true → soft-delete + session invalidation + 202 + purgeAfter; no confirm → 422 CONFIRMATION_REQUIRED — NFR-5 delete | Task 3 (deletedAt/purgeAfter columns), Task 13 (softDelete), Task 14 (controller 202) |
| All errors follow ErrorEnvelope via GlobalExceptionFilter | Task 1 (envelope), Task 2 (filter), Task 15 (wired global) |
| All identifiers/fields/routes in English | Enforced throughout; Arabic only in error `message` strings (Task 1) |

Other spec sections: data types/DTOs (3.2) → Tasks 5, 6, 11, 13; modules table (4.1) → Tasks 8, 9, 12, 14 + PrismaModule(Sprint 0)/extension(10); REST endpoints (4.2) → Tasks 8, 12, 14; guards/decorators (4.3) → Task 9; flows (5.1–5.4) → Tasks 7, 9; error table (6.1) → Task 1; handling principles (6.2) → Tasks 1, 2, 13; scope-leakage prevention (6.3) → Tasks 9, 10, 11, 17; dependencies + env (7) → Tasks 3, 4, 5, 6; migration guidance (7 note) → Task 3.

**Deferred (with reason):**
- **Scheduled purge worker** (the cron job that hard-deletes tenant rows after `purgeAfter`): explicitly out of scope per spec section 4.2/8 ("تفاصيل المهمة المجدولة وفترة الاحتجاز تُسلَّم لـbackend/devops"). This plan implements the immediate soft-delete + `purgeAfter` scheduling field; the worker is a follow-up (BullMQ infra exists from Sprint 0).
- **Real billing / trial expiry enforcement**: out of scope (Phase 6). Only a `trialing` Subscription row is created.
- **LinkedIn/X OAuth + actual publishing**: out of scope (later phase); `AccountProfile` is descriptive only.
- **RBAC / team invitations, email verification, password reset, MFA**: out of scope (later phases).

**2. Placeholder scan** — searched for TBD/TODO/"implement later"/"add validation"/"handle edge cases"/"similar to Task N": none present. Every code step contains complete code. The only narrative steps are verification/commit steps and Task 18 (a pure gate). Task 17 Step 2/3 contains an explicit decision (strict `422` rejection of forged fields) rather than a placeholder — resolved inline.

**3. Type consistency** — verified across tasks:
- `TenantContext = { userId; tenantId }` defined in Task 9, consumed identically in Tasks 11(via service args), 12, 13, 14.
- `ErrorEnvelope = { statusCode; error; message }` defined Task 1, used in Task 2 and asserted in e2e.
- `AuthTokens = { accessToken; refreshToken; tokenType: 'Bearer'; expiresIn }` defined Task 5, returned by Task 7/8, asserted in Task 16.
- `JwtPayload = { sub; tenantId; type; iat; exp }` defined Task 5, consumed by Task 5 (verify*) and Task 9 (guard reads `payload.sub`/`payload.tenantId`).
- Method names consistent: `issueTokens`, `verifyAccess`, `verifyRefresh` (Task 5 ↔ 7 ↔ 9); `listForTenant`/`createForTenant`/`updateForTenant`/`deleteForTenant` (Task 11 ↔ 12); `me`/`exportData`/`softDelete` (Task 13 ↔ 14); `forTenant` (Task 10).
- Error factory names consistent: `emailAlreadyExists`, `invalidCredentials`, `tokenExpired`, `invalidRefreshToken`, `unauthenticated`, `accountNotFound`, `confirmationRequired` (Task 1) used verbatim in Tasks 2, 5, 7, 9, 11, 13.
- Guard class names `JwtAuthGuard`, `TenantGuard` and decorator `CurrentTenant` match the canonical contract and the spec section 4.3 exactly.

**Scope:** Single subsystem (auth + tenant + account profiles), builds on Sprint 0, produces working tested software (unit + e2e green, migrated DB). Defines the shared auth/tenant contract later phases consume.
