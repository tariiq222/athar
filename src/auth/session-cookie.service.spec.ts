import { SessionCookieService } from './session-cookie.service';

function fakeRes(): { headers: Record<string, string | string[]> } & { setHeader: jest.Mock } {
  const headers: Record<string, string | string[]> = {};
  return { headers, setHeader: jest.fn((name: string, value: string) => { headers[name.toLowerCase()] = value; }) };
}

describe('SessionCookieService', () => {
  const svc = new SessionCookieService();

  it('issue() sets session_token cookie with HttpOnly, SameSite=Lax, Path=/, Max-Age=900', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    svc.issue(res as any, 'jwt.access.token');
    const setCookie = (res.headers['set-cookie'] as string) ?? '';
    expect(setCookie).toContain('session_token=jwt.access.token');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=900');
  });

  it('issue() adds Secure flag in production (NODE_ENV=production)', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    svc.issue(res as any, 'token');
    expect((res.headers['set-cookie'] as string)).toContain('Secure');
  });

  it('issue() omits Secure in development (NODE_ENV != production)', () => {
    process.env.NODE_ENV = 'development';
    const res = fakeRes();
    svc.issue(res as any, 'token');
    expect((res.headers['set-cookie'] as string)).not.toContain('Secure');
  });

  it('clear() sets Max-Age=0 to expire immediately', () => {
    const res = fakeRes();
    svc.clear(res as any);
    expect((res.headers['set-cookie'] as string)).toContain('Max-Age=0');
  });

  describe('sessionCookieHeader()', () => {
    it('produces session_token with HttpOnly, SameSite=Lax, Path=/, Max-Age=900', () => {
      process.env.NODE_ENV = 'development';
      const header = svc.sessionCookieHeader('jwt.access.token');
      expect(header).toBe('session_token=jwt.access.token; HttpOnly; SameSite=Lax; Path=/; Max-Age=900');
    });

    it('appends Secure in production', () => {
      process.env.NODE_ENV = 'production';
      expect(svc.sessionCookieHeader('t')).toBe(
        'session_token=t; HttpOnly; SameSite=Lax; Path=/; Max-Age=900; Secure',
      );
    });

    it('matches the header issue() writes (issue reuses the builder)', () => {
      process.env.NODE_ENV = 'development';
      const res = fakeRes();
      svc.issue(res as any, 'tok');
      expect(res.headers['set-cookie']).toBe(svc.sessionCookieHeader('tok'));
    });
  });

  describe('csrfCookieHeader()', () => {
    it('produces csrf_token WITHOUT HttpOnly (JS-readable), SameSite=Lax, Path=/, Max-Age=900', () => {
      process.env.NODE_ENV = 'development';
      const header = svc.csrfCookieHeader('csrf123');
      expect(header).toBe('csrf_token=csrf123; SameSite=Lax; Path=/; Max-Age=900');
      expect(header).not.toContain('HttpOnly');
    });

    it('appends Secure in production', () => {
      process.env.NODE_ENV = 'production';
      expect(svc.csrfCookieHeader('csrf123')).toBe(
        'csrf_token=csrf123; SameSite=Lax; Path=/; Max-Age=900; Secure',
      );
    });
  });
});
