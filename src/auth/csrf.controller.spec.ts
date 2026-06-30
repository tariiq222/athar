import { CsrfController } from './csrf.controller';
import { CsrfService } from './csrf.service';
import { SessionCookieService } from './session-cookie.service';

describe('CsrfController', () => {
  const ctrl = new CsrfController(new CsrfService(), new SessionCookieService());

  function fakeRes(): { setHeader: jest.Mock } {
    return { setHeader: jest.fn() };
  }

  it('GET /auth/csrf returns a csrfToken and sets the csrf_token cookie', () => {
    const res = fakeRes();
    const body = ctrl.csrf(res as any);
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken.length).toBeGreaterThan(20);
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('csrf_token='));
    const cookie = res.setHeader.mock.calls[0][1] as string;
    expect(cookie).toContain(`csrf_token=${body.csrfToken}`);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    // CSRF cookie must be readable by JS — it must NOT be HttpOnly.
    expect(cookie).not.toContain('HttpOnly');
  });

  it('issues a different token on each call', () => {
    const a = ctrl.csrf(fakeRes() as any);
    const b = ctrl.csrf(fakeRes() as any);
    expect(a.csrfToken).not.toBe(b.csrfToken);
  });
});
