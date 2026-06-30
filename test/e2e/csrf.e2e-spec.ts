// Shared env defaults so the e2e can boot AppModule without a real .env.
import '../e2e-env-setup';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const e2e = process.env.DATABASE_URL;

(e2e ? describe : describe.skip)('CSRF protection', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'https://app.athar.sa';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // cookie-parser must be mounted BEFORE the CsrfGuard so req.cookies is set.
    app.use(require('cookie-parser')());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/csrf sets csrf_token cookie', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c: string) => /^csrf_token=/.test(c))).toBe(true);
    expect(res.body.csrfToken).toBeDefined();
  });

  it('POST /auth/register with matching csrf cookie+header succeeds (when Origin allow-listed)', async () => {
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
    const csrfCookie = (csrfRes.headers['set-cookie'][0] as string).split(';')[0];
    const csrfToken = csrfRes.body.csrfToken;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://app.athar.sa')
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email: `csrf-${Date.now()}@x.com`,
        password: 'Passw0rd!',
        tenantName: 't',
        termsVersion: 'v1',
        acceptTerms: true,
      })
      .expect(201);
  });

  // The cookie-issuing endpoints (/auth/login, /auth/register, /auth/refresh,
  // /auth/csrf) are CSRF-exempt by design — they cannot require a token they are
  // about to mint (chicken-and-egg). So a register WITHOUT X-CSRF-Token is NOT
  // blocked by the CsrfGuard; it proceeds to validation/handler. We assert it is
  // NOT a CSRF rejection (403 from the guard) — here a valid payload yields 201.
  it('POST /auth/register WITHOUT X-CSRF-Token header is NOT CSRF-blocked (exempt path)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'https://app.athar.sa')
      .send({
        email: `csrf2-${Date.now()}@x.com`,
        password: 'Passw0rd!',
        tenantName: 't',
        termsVersion: 'v1',
        acceptTerms: true,
      });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });

  // The CsrfGuard enforces the double-submit check on NON-exempt mutations. We
  // can't hit one over HTTP yet (the only POST routes in this slice are the
  // exempt auth endpoints), so assert the guard contract directly: a mutation to
  // a non-exempt path with no cookie/header is rejected.
  it('CsrfGuard rejects a non-exempt mutation lacking the csrf cookie', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CsrfGuard } = require('../../src/auth/csrf.guard');
    const guard = new CsrfGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/api/v1/posts', headers: {}, cookies: {} }),
      }),
    };
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});
