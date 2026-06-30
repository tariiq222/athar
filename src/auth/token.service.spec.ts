import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

function makeService(): TokenService {
  const config = {
    get: (key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      };
      return map[key];
    },
  } as unknown as ConfigService;
  return new TokenService(new JwtService({}), config);
}

describe('TokenService', () => {
  const svc = makeService();

  it('issues a Bearer access+refresh pair with numeric expiresIn', async () => {
    const tokens = await svc.issueTokens('user-1', 'tenant-1');
    expect(tokens.tokenType).toBe('Bearer');
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
    expect(tokens.expiresIn).toBe(900); // 15m in seconds
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
  });

  it('verifyAccess returns the payload for a valid access token', async () => {
    const { accessToken } = await svc.issueTokens('user-1', 'tenant-1');
    const payload = await svc.verifyAccess(accessToken);
    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.type).toBe('access');
  });

  it('verifyRefresh returns payload for a refresh token, rejects an access token', async () => {
    const { accessToken, refreshToken } = await svc.issueTokens('user-1', 'tenant-1');
    const payload = await svc.verifyRefresh(refreshToken);
    expect(payload.type).toBe('refresh');
    await expect(svc.verifyRefresh(accessToken)).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('verifyAccess throws UNAUTHENTICATED on a garbage token', async () => {
    await expect(svc.verifyAccess('garbage')).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });

  // Sprint A — Task 2.1: hardening (HS256 + iss + aud).

  it('verifyAccess rejects a token with the wrong issuer', async () => {
    const bad = await svc.signAccess({ sub: 'u1', tenantId: 't1' }, { issuer: 'evil' });
    await expect(svc.verifyAccess(bad)).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });

  it('verifyAccess rejects a refresh token (cross-type)', async () => {
    const refresh = await svc.signRefresh({ sub: 'u1', tenantId: 't1' });
    await expect(svc.verifyAccess(refresh)).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });

  it('verifyAccess rejects a token signed with HS512 (wrong algorithm)', async () => {
    // Same secret, different algorithm — only the algorithms: ['HS256'] constraint
    // should reject this. (A different secret would be rejected by signature alone,
    // which would mask whether the algorithm guard is actually doing its job.)
    const other = new JwtService({
      secret: 'access-secret',
      signOptions: { algorithm: 'HS512' },
    });
    const tok = await other.signAsync({ sub: 'u1', tenantId: 't1', type: 'access' });
    await expect(svc.verifyAccess(tok)).rejects.toMatchObject({
      response: { error: 'UNAUTHENTICATED' },
    });
  });
});