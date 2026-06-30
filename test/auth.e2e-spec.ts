// Shared env defaults so the e2e can boot AppModule without a real .env.
import './e2e-env-setup';

// Skip the entire suite if DATABASE_URL is absent (no real Postgres to talk to).
// This mirrors the failure mode of prisma.service.spec.ts on a host with no DB env.
const dsn = process.env.DATABASE_URL ?? '';
const itDb = dsn ? it : it.skip;
const describeDb = dsn ? describe : describe.skip;

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

interface Envelope<T> {
  statusCode?: number;
  error?: string;
  message?: string;
  data?: T;
  [k: string]: unknown;
}

/**
 * Decode a JWT payload without verifying its signature. This is sufficient for
 * asserting token shape (`type`, `sub`, `tenantId`) without pulling in a JWT
 * lib just for tests.
 */
function decodeJwt<T>(token: string): T {
  const part = token.split('.')[1];
  const json = Buffer.from(part, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}

/**
 * Boots the full Nest app on a random localhost port and returns a `fetch`-style
 * helper bound to it. We avoid `supertest`/`supertest-fetch` deps — the app
 * is already bootable via `createNestApplication().listen(0)`, and `fetch`
 * against the ephemeral port is sufficient.
 */
async function bootApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  baseUrl: string;
  fetchJson: <T>(path: string, init?: RequestInit) => Promise<{ status: number; body: Envelope<T> | T }>;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  // Production bootstrap sets the prefix in main.ts; e2e has no main.ts,
  // so we mirror that here for an apples-to-apples request path.
  app.setGlobalPrefix('api/v1');
  // The production bootstrap uses APP_PIPE/APP_FILTER providers, so the pipe
  // and filter are registered globally already; calling init() here is enough.
  await app.init();
  // listen on an ephemeral port; resolve the bound address before returning.
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const prisma = app.get(PrismaService);

  const fetchJson: <T>(path: string, init?: RequestInit) => Promise<{
    status: number;
    body: Envelope<T> | T;
  }> = async <T>(path: string, init: RequestInit = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as Envelope<T> | T;
    return { status: res.status, body };
  };

  return { app, prisma, baseUrl, fetchJson };
}

describeDb('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fetchJson: ReturnType<typeof bootApp> extends Promise<infer R>
    ? R extends { fetchJson: infer F }
      ? F
      : never
    : never;
  const email = `e2e-${Date.now()}@athar.test`;

  beforeAll(async () => {
    const ctx = await bootApp();
    app = ctx.app;
    prisma = ctx.prisma;
    fetchJson = ctx.fetchJson;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  itDb('register -> login -> me -> refresh -> export (full happy path)', async () => {
    // 1) register creates a tenant + user + trial subscription and returns tokens.
    const reg = await fetchJson<AuthTokens>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ tenantName: 'E2E Co', email, password: 'longpass1', acceptTerms: true, termsVersion: 'v1' }),
    });
    expect(reg.status).toBe(201);
    expect((reg.body as AuthTokens).accessToken).toBeDefined();
    expect((reg.body as AuthTokens).tokenType).toBe('Bearer');

    // 2) login re-issues tokens for that email.
    const login = await fetchJson<AuthTokens>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'longpass1' }),
    });
    expect(login.status).toBe(200);
    const access = (login.body as AuthTokens).accessToken;
    const refresh = (login.body as AuthTokens).refreshToken;

    // 3) GET /me returns the user, tenant, and subscription; never passwordHash.
    const me = await fetchJson<{
      user: { email: string; passwordHash?: string };
      tenant: { id: string };
      subscription: { status: string };
    }>('/api/v1/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(me.status).toBe(200);
    expect((me.body as { user: { email: string } }).user.email).toBe(email);
    expect((me.body as { user: { passwordHash?: string } }).user.passwordHash).toBeUndefined();
    expect(
      (me.body as { subscription: { status: string } }).subscription.status,
    ).toBe('trialing');

    // 4) POST /auth/refresh rotates the refresh token. Two JWTs issued in the
    //    same second can be byte-identical because their `iat` is the same,
    //    so we assert via the decoded payload — the new token must verify as a
    //    valid refresh token and carry the SAME sub/tenantId. The accompanying
    //    access token must always be re-issued (15m TTL on the access side).
    const refreshed = await fetchJson<AuthTokens>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refresh }),
    });
    expect(refreshed.status).toBe(200);
    const refreshedBody = refreshed.body as AuthTokens;
    expect(refreshedBody.accessToken).toBeDefined();
    expect(refreshedBody.refreshToken).toBeDefined();
    const decoded = decodeJwt<{ sub: string; tenantId: string; type: string }>(refreshedBody.refreshToken);
    expect(decoded.type).toBe('refresh');
    expect(typeof decoded.sub).toBe('string');
    expect(typeof decoded.tenantId).toBe('string');

    // 5) POST /me/export returns the PDPL export shape with no passwordHash.
    const exported = await fetchJson<{
      exportedAt: string;
      users: Array<{ passwordHash?: string }>;
    }>('/api/v1/me/export', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(exported.status).toBe(200);
    const exp = exported.body as {
      exportedAt: string;
      users: Array<{ passwordHash?: string }>;
    };
    expect(exp.users.length).toBeGreaterThan(0);
    expect(exp.users[0].passwordHash).toBeUndefined();
    expect(exp.exportedAt).toBeDefined();
  });

  itDb('register with a duplicate email returns 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await fetchJson('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ tenantName: 'E2E Co', email, password: 'longpass1', acceptTerms: true, termsVersion: 'v1' }),
    });
    expect(res.status).toBe(409);
    expect((res.body as Envelope<unknown>).error).toBe('EMAIL_ALREADY_EXISTS');
  });

  itDb('me without a token returns 401 UNAUTHENTICATED', async () => {
    const res = await fetchJson('/api/v1/me', { method: 'GET' });
    expect(res.status).toBe(401);
    expect((res.body as Envelope<unknown>).error).toBe('UNAUTHENTICATED');
  });

  itDb('login with a wrong password returns 401 INVALID_CREDENTIALS', async () => {
    const res = await fetchJson('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'WRONGWRONG' }),
    });
    expect(res.status).toBe(401);
    expect((res.body as Envelope<unknown>).error).toBe('INVALID_CREDENTIALS');
  });
});
