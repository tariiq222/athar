// Sprint A — Task 14.1: pre-launch journey E2E.
//
// Single end-to-end test that exercises the user-visible path a real Saudi SMB
// takes on day-one: signup -> onboard brand -> pay -> get an invoice with the
// correct VAT split. This is the final P0 gate before launch.
//
// Steps:
//   1) POST /api/v1/auth/register               -> 201, tenantId + accessToken
//   2) POST /api/v1/brand/profile               -> 201, brand profile committed
//   3) POST /api/v1/billing/webhook (HMAC-signed) -> 201, subscription activated
//   4) prisma.invoice.findFirst                -> assert VAT columns
//
// Skipped when DATABASE_URL is missing (no Postgres to talk to). CI runs it
// against docker-compose; locally it runs whenever the athar stack is up.
//
// Implementation notes that bit us writing this:
//   - The webhook controller verifies HMAC over the EXACT bytes Moyasar sent.
//     The default JSON parser re-serializes the body, so we MUST populate
//     `req.rawBody` ourselves (production wires this with `rawBody: true` in
//     main.ts). We patch the underlying express json() parser's `verify` hook
//     here to capture the raw bytes — same effect, different registration site.
//   - activateFromPayment requires `payment.metadata.cycle` to be 'monthly'
//     or 'annual' (fail-closed); the plan's example omitted `cycle`.
//   - activateFromPayment also requires the payment amount to match the
//     expected plan price (either ex-VAT OR VAT-inclusive); 68885 is the
//     VAT-inclusive amount for business-monthly (59900 + 15% VAT = 68885).
//   - BrandProfileDraftDto requires many fields beyond `tone` and `topics`.
//     We send a complete DTO so validation passes.
import './e2e-env-setup';

const dsn = process.env.DATABASE_URL ?? '';
const itDb = dsn ? it : it.skip;
const describeDb = dsn ? describe : describe.skip;

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import { createHmac } from 'crypto';
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

interface Envelope<T> {
  statusCode?: number;
  error?: string;
  message?: string;
  data?: T;
  [k: string]: unknown;
}

/**
 * Capture rawBody on every JSON-parsed request, matching production's
 * `rawBody: true` (main.ts). Without this, the webhook controller's HMAC
 * check fails because Nest's default JSON parser re-serializes the body.
 */
function installRawBodyCapture(app: INestApplication): void {
  const expressApp = app.getHttpAdapter().getInstance();
  // Re-register body-parser with the `verify` hook so the raw buffer is
  // attached to the request BEFORE the JSON parser mutates it. This mirrors
  // `NestFactory.create(AppModule, { rawBody: true })` — same parser, same hook.
  expressApp.use(
    json({
      verify: (
        req: { rawBody?: Buffer } & import('http').IncomingMessage,
        _res: import('http').ServerResponse,
        buf: Buffer,
      ) => {
        req.rawBody = buf;
      },
      limit: '1mb',
    }),
  );
}

async function bootApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  baseUrl: string;
  fetchJson: <T>(
    path: string,
    init?: RequestInit,
  ) => Promise<{ status: number; body: Envelope<T> | T }>;
  fetchRaw: (path: string, init?: RequestInit) => Promise<{ status: number; text: string }>;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1'); // mirror main.ts
  installRawBodyCapture(app);
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

  // fetchRaw sends a JSON-string body and returns the response TEXT, used by
  // the webhook test where the body must be sent as raw bytes for HMAC.
  const fetchRaw = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${baseUrl}${path}`, init);
    const text = await res.text();
    return { status: res.status, text };
  };

  return { app, prisma, baseUrl, fetchJson, fetchRaw };
}

describeDb('Pre-launch journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fetchJson: ReturnType<typeof bootApp> extends Promise<infer R>
    ? R extends { fetchJson: infer F }
      ? F
      : never
    : never;
  let fetchRaw: ReturnType<typeof bootApp> extends Promise<infer R>
    ? R extends { fetchRaw: infer F }
      ? F
      : never
    : never;

  // Unique email per run so the test is re-runnable on a shared DB.
  const email = `prelaunch-${Date.now()}@athar.test`;
  let tenantId: string | null = null;

  beforeAll(async () => {
    const ctx = await bootApp();
    app = ctx.app;
    prisma = ctx.prisma;
    fetchJson = ctx.fetchJson;
    fetchRaw = ctx.fetchRaw;
  });

  afterAll(async () => {
    // Cascade-delete everything tied to the tenant we created so re-runs on a
    // shared DB don't accumulate. Order: leaf-most dependent first.
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.invoice.deleteMany({ where: { tenantId } });
      await prisma.usageRecord.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      // AccountProfile / BrandProfile / Post are tenant-scoped — delete them
      // BEFORE Tenant to avoid FK violations on BrandProfile_tenantId_fkey.
      await prisma.accountProfile.deleteMany({ where: { tenantId } });
      await prisma.brandProfile.deleteMany({ where: { tenantId } });
      await prisma.post.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    } else {
      // Register call may have failed — clean up by email anyway.
      await prisma.user.deleteMany({ where: { email } });
    }
    await app.close();
  });

  itDb('signup -> register tenant -> subscribe via webhook -> invoice with VAT', async () => {
    // ---- 1) signup ---------------------------------------------------------
    // Registering creates: tenant, owner user, trial subscription, PDPL
    // consent row, audit log. Returns access + refresh JWTs and the tenantId.
    const reg = await fetchJson<AuthTokens>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantName: 'Acme',
        email,
        password: 'longpass1',
        acceptTerms: true,
        termsVersion: 'v1',
      }),
    });
    expect(reg.status).toBe(201);
    const tokens = reg.body as AuthTokens;
    expect(tokens.accessToken).toBeDefined();
    tenantId = tokens.tenantId;

    // ---- 2) brand profile --------------------------------------------------
    // BrandProfileDraftDto requires every field below (tone, audience, goals,
    // topics, prohibitions, competitors, keywords, brandKit, accounts). The
    // plan's snippet only sets tone+topics; that would 400 on validation.
    const brand = await fetchJson('/api/v1/brand/profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({
        tone: 'professional',
        audience: 'Saudi SMBs',
        goals: 'awareness',
        topics: ['saudi tech'],
        prohibitions: [],
        competitors: [],
        keywords: ['saudi', 'tech'],
        brandKit: {
          colors: ['#000000'],
          visualStyle: 'minimal',
          font: 'IBM Plex Sans Arabic',
        },
        accounts: [{ platform: 'linkedin', handle: 'acme' }],
      }),
    });
    expect(brand.status).toBe(201);

    // ---- 3) webhook --------------------------------------------------------
    // The webhook controller re-fetches the payment from Moyasar before
    // activating, so we MUST stub that HTTP call OR the test will hit the
    // live gateway. We monkey-patch global.fetch scoped to this test.
    //
    // The event id MUST be unique per run — idempotency claims persist
    // across runs and a duplicate event id short-circuits to
    // `{ idempotent: true }` with no invoice created. Same for the payment
    // id in the URL the controller re-fetches.
    const originalFetch = global.fetch;
    const eventId = `evt_prelaunch_${Date.now()}`;
    const paymentId = `pay_prelaunch_${Date.now()}`;
    const webhookBody = JSON.stringify({
      id: eventId,
      type: 'payment_paid',
      created_at: new Date().toISOString(),
      secret_token: 'whsec_test_dummy',
      data: {
        id: paymentId,
        status: 'paid',
        amount: 68885, // 59900 + 15% VAT = 68885 (VAT-inclusive, business monthly)
        currency: 'SAR',
        source: { type: 'creditcard', company: 'visa' },
        metadata: {
          tenant_id: tenantId,
          plan_code: 'business',
          cycle: 'monthly',
        },
      },
    });

    const ts = Math.floor(Date.now() / 1000);
    const sig = `${ts}.${createHmac(
      'sha256',
      process.env.MOYASAR_WEBHOOK_SECRET ?? 'whsec_test_dummy',
    )
      .update(`${ts}.${webhookBody}`)
      .digest('hex')}`;

    try {
      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        const target = typeof url === 'string' ? url : url.toString();
        // Stub the Moyasar payment-fetch call that activateFromPayment makes
        // to re-verify the payment server-side. We echo the webhook payload
        // back as if it were the fetched payment.
        if (target.includes(`api.moyasar.com/v1/payments/${paymentId}`)) {
          return new Response(
            JSON.stringify({
              id: paymentId,
              status: 'paid',
              amount: 68885,
              currency: 'SAR',
              source: { type: 'creditcard', company: 'visa' },
              metadata: {
                tenant_id: tenantId,
                plan_code: 'business',
                cycle: 'monthly',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Fall through to the real fetch for unrelated calls (none on this path).
        return originalFetch(url as never, init);
      }) as typeof fetch;

      const hookRes = await fetchRaw('/api/v1/billing/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          signature: sig,
        },
        body: webhookBody,
      });
      expect(hookRes.status).toBe(200);
    } finally {
      global.fetch = originalFetch;
    }

    // ---- 4) invoice assertion ---------------------------------------------
    // The webhook handler creates the invoice atomically with the subscription
    // update. Look it up by tenantId (the invoice number is auto-generated)
    // and assert the VAT split.
    const inv = await prisma.invoice.findFirst({ where: { tenantId: tenantId! } });
    expect(inv).not.toBeNull();
    expect(inv!.totalMinor).toBe(68885);
    expect(inv!.vatMinor).toBe(8985); // 68885 - 59900
    expect(inv!.subtotalMinor).toBe(59900);
  });
});
