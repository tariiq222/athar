import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

function ctx(opts: {
  method: string;
  path?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  authorization?: string;
}): ExecutionContext {
  const headers: Record<string, string> = {};
  if (opts.csrfHeader !== undefined) headers['x-csrf-token'] = opts.csrfHeader;
  if (opts.authorization !== undefined) headers['authorization'] = opts.authorization;
  const cookies: Record<string, string> = {};
  if (opts.csrfCookie !== undefined) cookies['csrf_token'] = opts.csrfCookie;
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: opts.method,
        path: opts.path ?? '/api/v1/posts/1',
        headers,
        cookies,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows safe methods (GET) without any token', () => {
    expect(guard.canActivate(ctx({ method: 'GET' }))).toBe(true);
  });

  it('allows exempt cookie-issuing auth paths', () => {
    expect(guard.canActivate(ctx({ method: 'POST', path: '/api/v1/auth/login' }))).toBe(true);
  });

  it('allows the Moyasar webhook (HMAC-authenticated, server-to-server)', () => {
    expect(guard.canActivate(ctx({ method: 'POST', path: '/api/v1/billing/webhook' }))).toBe(true);
  });

  it('allows Bearer-token requests (token auth is not CSRF-vulnerable)', () => {
    expect(guard.canActivate(ctx({ method: 'PATCH', authorization: 'Bearer abc.def.ghi' }))).toBe(
      true,
    );
  });

  it('accepts a cookie-session mutation when csrf cookie matches the header', () => {
    expect(guard.canActivate(ctx({ method: 'POST', csrfCookie: 'tok', csrfHeader: 'tok' }))).toBe(
      true,
    );
  });

  it('rejects a cookie-session mutation with no csrf cookie', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', csrfHeader: 'tok' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a cookie-session mutation missing the X-CSRF-Token header', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', csrfCookie: 'tok' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a cookie-session mutation when cookie and header differ', () => {
    expect(() =>
      guard.canActivate(ctx({ method: 'POST', csrfCookie: 'a', csrfHeader: 'b' })),
    ).toThrow(ForbiddenException);
  });
});
