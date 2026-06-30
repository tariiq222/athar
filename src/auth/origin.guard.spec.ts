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