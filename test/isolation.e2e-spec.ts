// Environment: same defaults as src/app.module.spec.ts so the e2e can boot
// AppModule without a real .env. These are no-ops when already set.
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.JWT_ACCESS_TTL ||= '15m';
process.env.JWT_REFRESH_TTL ||= '7d';
process.env.TRIAL_DURATION_DAYS ||= '7';
process.env.PURGE_RETENTION_DAYS ||= '30';
process.env.DATABASE_URL ||= 'postgresql://athar:athar@localhost:5442/athar?schema=public';
process.env.OPENAI_API_KEY ||= 'test-openai-key';
process.env.OPENAI_IMAGE_MODEL ||= 'gpt-image-1';
process.env.OPENAI_VISION_MODEL ||= 'gpt-4o-mini';
process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
process.env.ANTHROPIC_MODEL ||= 'claude-sonnet-4-5';
process.env.MINIO_ENDPOINT ||= 'localhost';
process.env.MINIO_PORT ||= '9000';
process.env.MINIO_ACCESS_KEY ||= 'test-minio';
process.env.MINIO_SECRET_KEY ||= 'test-minio-secret';
process.env.MINIO_BUCKET ||= 'athar-images';
process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';

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

async function bootApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  baseUrl: string;
  fetchJson: <T>(path: string, init?: RequestInit) => Promise<{ status: number; body: Envelope<T> | T }>;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const prisma = app.get(PrismaService);

  const fetchJson = async <T>(path: string, init: RequestInit = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as Envelope<T> | T;
    return { status: res.status, body };
  };

  return { app, prisma, baseUrl, fetchJson };
}

describeDb('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fetchJson: ReturnType<typeof bootApp> extends Promise<infer R>
    ? R extends { fetchJson: infer F }
      ? F
      : never
    : never;
  const emailA = `iso-a-${Date.now()}@athar.test`;
  const emailB = `iso-b-${Date.now()}@athar.test`;
  // A separate, fresh email used only by the forged-tenantId test (we can't
  // suffix `emailA` because `.test_2` would be rejected by class-validator's
  // IsEmail as an invalid TLD).
  const emailAForge = `iso-a-forge-${Date.now()}@athar.test`;

  /**
   * Register a fresh tenant+user, then plant a BrandProfile row directly via
   * Prisma (the public BrandProfile onboarding route requires multi-step UI,
   * not part of this scope).
   */
  async function registerAndBrand(email: string) {
    const reg = await fetchJson<AuthTokens>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ tenantName: `Iso ${email}`, email, password: 'longpass1' }),
    });
    expect(reg.status).toBe(201);
    const access = (reg.body as AuthTokens).accessToken;

    const me = await fetchJson<{
      tenant: { id: string };
      user: { id: string };
    }>('/api/v1/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(me.status).toBe(200);
    const tenantId = (me.body as { tenant: { id: string } }).tenant.id;

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
    const ctx = await bootApp();
    app = ctx.app;
    prisma = ctx.prisma;
    fetchJson = ctx.fetchJson;
  });

  afterAll(async () => {
    for (const email of [emailA, emailB, emailAForge]) {
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

  itDb('Tenant A cannot read/update/delete Tenant B account profiles (404)', async () => {
    const a = await registerAndBrand(emailA);
    const b = await registerAndBrand(emailB);

    // B creates an account profile scoped to its own tenant.
    const created = await fetchJson<{ id: string; tenantId: string }>('/api/v1/accounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${b.access}` },
      body: JSON.stringify({
        brandProfileId: b.brandProfileId,
        platform: 'x',
        handle: '@b',
      }),
    });
    expect(created.status).toBe(201);
    const bAccountId = (created.body as { id: string }).id;

    // A's list MUST NOT contain B's row.
    const listA = await fetchJson<Array<{ id: string }>>('/api/v1/accounts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${a.access}` },
    });
    expect(listA.status).toBe(200);
    const aList = listA.body as Array<{ id: string }>;
    expect(aList.find((r) => r.id === bAccountId)).toBeUndefined();

    // A patching B's row -> 404 ACCOUNT_NOT_FOUND, not 403 (no leak of existence).
    const patch = await fetchJson('/api/v1/accounts/' + bAccountId, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${a.access}` },
      body: JSON.stringify({ handle: '@hijack' }),
    });
    expect(patch.status).toBe(404);
    expect((patch.body as Envelope<unknown>).error).toBe('ACCOUNT_NOT_FOUND');

    // A deleting B's row -> 404 (still invisible to A).
    const del = await fetchJson('/api/v1/accounts/' + bAccountId, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${a.access}` },
    });
    expect(del.status).toBe(404);

    // B's row still exists for B (deletion above was a no-op for the real row).
    const listB = await fetchJson<Array<{ id: string }>>('/api/v1/accounts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${b.access}` },
    });
    expect(listB.status).toBe(200);
    const bList = listB.body as Array<{ id: string }>;
    expect(bList.find((r) => r.id === bAccountId)).toBeDefined();

    // Cleanup the row so afterAll can run quickly.
    await prisma.accountProfile.deleteMany({ where: { id: bAccountId } });
  });

  itDb('a forged tenantId in the create body is rejected (422) — scope cannot be forged', async () => {
    const a = await registerAndBrand(emailAForge);
    // Global pipe has forbidNonWhitelisted=true — extra props are rejected
    // rather than silently stripped. That's the spec's "Decision" branch.
    const res = await fetchJson('/api/v1/accounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.access}` },
      body: JSON.stringify({
        brandProfileId: a.brandProfileId,
        platform: 'x',
        tenantId: 'tenant-EVIL',
      }),
    });
    expect(res.status).toBe(422);
  });
});
