// Shared env defaults so the e2e can boot AppModule without a real .env.
import '../e2e-env-setup';

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { OriginGuard } from '../../src/auth/origin.guard';

const e2e = process.env.DATABASE_URL;

(e2e ? describe : describe.skip)('Origin validation on mutations', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'https://app.athar.sa';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(require('cookie-parser')());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // GET is a safe method — never Origin-gated.
  it('allows GET /auth/csrf regardless of Origin', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Origin', 'https://evil.example')
      .expect(200);
  });

  // The cookie-issuing auth endpoints are Origin-exempt by design: non-browser
  // callers minting the session/csrf cookie carry no browser Origin header, so
  // the OriginGuard cannot require one. A bad Origin therefore does NOT yield a
  // 403 from the guard — the request proceeds to the handler (here: invalid
  // credentials -> 401), proving the guard let it through rather than blocking
  // it on Origin grounds.
  it('does NOT Origin-block POST /auth/login (exempt path)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'nobody@example.com', password: 'wrong-pass' });
    expect(res.status).not.toBe(403);
  });

  // The OriginGuard enforces the allow-list on NON-exempt mutations. The only
  // POST routes in this slice are the exempt auth endpoints, so assert the guard
  // contract directly against a non-exempt path.
  it('OriginGuard rejects a non-exempt mutation from a disallowed Origin', () => {
    const guard = new OriginGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/v1/posts',
          headers: { origin: 'https://evil.example' },
        }),
      }),
    } as any;
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('OriginGuard rejects a non-exempt mutation with a missing Origin header', () => {
    const guard = new OriginGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', path: '/api/v1/posts', headers: {} }),
      }),
    } as any;
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});
