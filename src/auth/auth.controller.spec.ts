import { AuthController } from './auth.controller';
import { CsrfService } from './csrf.service';
import { SessionCookieService } from './session-cookie.service';

describe('AuthController', () => {
  const tokens = {
    accessToken: 'a',
    refreshToken: 'r',
    tokenType: 'Bearer' as const,
    expiresIn: 900,
    tenantId: 't1',
  };
  const service = {
    register: jest.fn(async () => tokens),
    login: jest.fn(async () => tokens),
    refresh: jest.fn(async () => tokens),
    me: jest.fn(),
  };
  const ctrl = new AuthController(service as any, new CsrfService(), new SessionCookieService());

  function fakeRes(): { setHeader: jest.Mock } {
    return { setHeader: jest.fn() };
  }

  beforeEach(() => jest.clearAllMocks());

  it('register delegates to the service and returns tokens + csrfToken', async () => {
    const dto = { tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' };
    const res = fakeRes();
    const result = await ctrl.register(dto as any, res as any);
    expect(service.register).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject(tokens);
    expect(typeof result.csrfToken).toBe('string');
  });

  it('login delegates to the service', async () => {
    const res = fakeRes();
    const result = await ctrl.login({ email: 'a@b.com', password: 'x' } as any, res as any);
    expect(result).toMatchObject(tokens);
  });

  it('refresh delegates to the service', async () => {
    const res = fakeRes();
    const result = await ctrl.refresh({ refreshToken: 'r' } as any, res as any);
    expect(result).toMatchObject(tokens);
  });

  it('login sets Set-Cookie with session_token AND csrf_token', async () => {
    const res = fakeRes();
    await ctrl.login({ email: 'a@b.com', password: 'x' } as any, res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.anything());
    const value = JSON.stringify(res.setHeader.mock.calls[0][1]);
    expect(value).toContain('session_token=a');
    expect(value).toContain('csrf_token=');
    expect(value).toContain('HttpOnly');
  });
});
