import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxWithHeader(authorization?: string) {
  const request: any = { headers: authorization ? { authorization } : {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe('JwtAuthGuard', () => {
  it('rejects a request with no Authorization header (UNAUTHENTICATED)', async () => {
    const tokenSvc = { verifyAccess: jest.fn() };
    const guard = new JwtAuthGuard(tokenSvc as any);
    const { context } = ctxWithHeader(undefined);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });

  it('attaches tenantContext from a verified access token', async () => {
    const tokenSvc = {
      verifyAccess: jest.fn(async () => ({ sub: 'u1', tenantId: 't1', type: 'access' })),
    };
    const guard = new JwtAuthGuard(tokenSvc as any);
    const { request, context } = ctxWithHeader('Bearer good.token.here');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.tenantContext).toEqual({ userId: 'u1', tenantId: 't1' });
    expect(tokenSvc.verifyAccess).toHaveBeenCalledWith('good.token.here');
  });

  it('propagates TOKEN_EXPIRED from the token service', async () => {
    const tokenSvc = {
      verifyAccess: jest.fn(async () => {
        throw { response: { error: 'TOKEN_EXPIRED' } };
      }),
    };
    const guard = new JwtAuthGuard(tokenSvc as any);
    const { context } = ctxWithHeader('Bearer expired');
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { error: 'TOKEN_EXPIRED' },
    });
  });
});