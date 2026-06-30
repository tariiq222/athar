import { SessionMiddleware } from './session.middleware';
import { TokenService } from './token.service';

function makeReq(cookies: Record<string, string> = {}): {
  cookies: Record<string, string>;
  user?: unknown;
} {
  return { cookies };
}

describe('SessionMiddleware', () => {
  let verify: jest.Mock;
  let mw: SessionMiddleware;

  beforeEach(() => {
    verify = jest.fn();
    mw = new SessionMiddleware({ verifyAccess: verify } as unknown as TokenService);
  });

  it('attaches req.user when session_token cookie is valid', async () => {
    verify.mockResolvedValue({ sub: 'u1', tenantId: 't1', type: 'access' });
    const req = makeReq({ session_token: 'jwt' });
    const next = jest.fn();
    await mw.use(req as any, {} as any, next);
    expect(req.user).toEqual({ sub: 'u1', tenantId: 't1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('does NOT attach req.user when no session cookie', async () => {
    const req = makeReq();
    const next = jest.fn();
    await mw.use(req as any, {} as any, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('does NOT attach req.user and does NOT throw when cookie is invalid', async () => {
    verify.mockRejectedValue(new Error('unauthenticated'));
    const req = makeReq({ session_token: 'bad' });
    const next = jest.fn();
    await mw.use(req as any, {} as any, next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith(); // never called next(err) — authz is the guard's job
  });
});
