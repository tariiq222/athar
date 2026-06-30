// Shared env defaults so the e2e can boot AppModule without a real .env.
import '../e2e-env-setup';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TokenService } from '../../src/auth/token.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const e2e = process.env.DATABASE_URL;

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
    // cookie-parser must be mounted BEFORE the SessionMiddleware so that
    // req.cookies is populated by the time the middleware reads it.
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
    // Seed a trial subscription so /me exercises the trialing→trial mapping.
    await prisma.subscription.create({
      data: {
        tenantId,
        status: 'trialing',
        plan: 'trial',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const issued = await tokens.issueTokens(user.id, tenantId);
    cookies = `session_token=${issued.accessToken}`;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { tenantId } });
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
