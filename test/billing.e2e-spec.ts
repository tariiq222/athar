// Phase 6 — billing module smoke (route contract).
// Boots the full AppModule against the live Postgres + Redis stack and asserts:
//   1) GET  /api/v1/billing/subscription returns 200 with status=trialing and
//      the trial plan's usage caps (drafts=10, images=5, searches=10).
//   2) POST /api/v1/billing/webhook with a wrong secret_token returns 401 with
//      WEBHOOK_SIGNATURE_INVALID.
//
// Gated on DATABASE_URL (same pattern as auth.e2e-spec.ts) — the suite skips
// when the live stack is not available; CI runs it against docker-compose.
// Shared env defaults so the e2e can boot AppModule without a real .env.
import './e2e-env-setup';
// value lets the bad-signature test be deterministic — any non-matching
// token is guaranteed to be rejected.
process.env.MOYASAR_WEBHOOK_SECRET ||= 'test-webhook-secret';

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
  tenantId: string;
}

interface SubscriptionResponse {
  status: string;
  planCode: string;
  usage: {
    drafts: { used: number; cap: number };
    images: { used: number; cap: number };
    searches: { used: number; cap: number };
  };
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
  fetchJson: <T>(
    path: string,
    init?: RequestInit,
  ) => Promise<{ status: number; body: Envelope<T> | T }>;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  // Mirror the production prefix set in main.ts.
  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const addr = server.address() as AddressInfo;
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

describeDb('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string | null = null;
  let fetchJson: ReturnType<typeof bootApp> extends Promise<infer R>
    ? R extends { fetchJson: infer F }
      ? F
      : never
    : never;
  const email = `billing-e2e-${Date.now()}@athar.test`;

  beforeAll(async () => {
    const ctx = await bootApp();
    app = ctx.app;
    prisma = ctx.prisma;
    fetchJson = ctx.fetchJson;
  });

  afterAll(async () => {
    // Cascade-delete all rows tied to the tenant created by this suite so a
    // re-run on a shared DB does not accumulate Tenant/Subscription/UsageRecord
    // rows. Order: leaf-most dependent first.
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.invoice.deleteMany({ where: { tenantId } });
      await prisma.usageRecord.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    } else {
      // Fallback for the case where the register call below never ran (CI skip).
      await prisma.user.deleteMany({ where: { email } });
    }
    await app.close();
  });

  itDb('GET /billing/subscription returns trialing + trial caps', async () => {
    // Register a fresh tenant — creates user + trialing subscription.
    const reg = await fetchJson<AuthTokens>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantName: 'BillingE2E',
        email,
        password: 'longpass1',
        acceptTerms: true,
        termsVersion: 'v1',
      }),
    });
    expect(reg.status).toBe(201);
    const token = (reg.body as AuthTokens).accessToken;
    tenantId = (reg.body as AuthTokens).tenantId;

    const res = await fetchJson<SubscriptionResponse>('/api/v1/billing/subscription', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const sub = res.body as SubscriptionResponse;
    expect(sub.status).toBe('trialing');
    expect(sub.usage.drafts.cap).toBe(10);
    expect(sub.usage.images.cap).toBe(5);
    expect(sub.usage.searches.cap).toBe(10);
  });

  itDb('POST /billing/webhook with a wrong secret_token returns 401', async () => {
    const res = await fetchJson('/api/v1/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({
        secret_token: 'wrong',
        type: 'payment_paid',
        data: { id: 'x', metadata: { tenant_id: 't1' } },
      }),
    });
    expect(res.status).toBe(401);
    expect((res.body as Envelope<unknown>).error).toBe('WEBHOOK_SIGNATURE_INVALID');
  });
});
