import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

type Row = Record<string, any>;

function makePrismaMock() {
  const users: Row[] = [];
  const tenants: Row[] = [];
  const subscriptions: Row[] = [];
  const tx = {
    tenant: { create: async ({ data }: any) => { const t = { id: 't' + (tenants.length + 1), ...data }; tenants.push(t); return t; } },
    user: { create: async ({ data }: any) => { const u = { id: 'u' + (users.length + 1), ...data }; users.push(u); return u; } },
    subscription: { create: async ({ data }: any) => { const s = { id: 's' + (subscriptions.length + 1), ...data }; subscriptions.push(s); return s; } },
  };
  return {
    users,
    tenants,
    subscriptions,
    user: {
      findFirst: async ({ where }: any) =>
        users.find(
          (u) =>
            (where.email === undefined || u.email === where.email) &&
            (where.id === undefined || u.id === where.id) &&
            (where.deletedAt === undefined || u.deletedAt == null),
        ) ?? null,
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error('user not found');
        Object.assign(u, data);
        return u;
      },
    },
    $transaction: async (fn: any) => fn(tx),
  };
}

function makeService(prisma: any) {
  const config = {
    get: (k: string) => ({ TRIAL_DURATION_DAYS: '7', JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'r', JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '7d' }[k]),
  } as unknown as ConfigService;
  const passwords = new PasswordService();
  // Lightweight token service double with rotation-relevant behavior.
  const tokens = {
    issueTokens: jest.fn(async (sub: string, tenantId: string) => ({
      accessToken: `acc.${sub}.${tenantId}`,
      refreshToken: `ref.${sub}.${Math.random()}`,
      tokenType: 'Bearer' as const,
      expiresIn: 900,
      tenantId,
    })),
    verifyRefresh: jest.fn(async (t: string) => {
      const [, sub] = t.split('.');
      return { sub, tenantId: 'tenant-1', type: 'refresh', iat: 0, exp: 0 };
    }),
  };
  return { svc: new AuthService(prisma, passwords, tokens as any, config), tokens, passwords };
}

describe('AuthService', () => {
  it('register creates tenant+user+subscription atomically and returns tokens', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    const out = await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    expect(out.tokenType).toBe('Bearer');
    expect(prisma.tenants).toHaveLength(1);
    expect(prisma.users).toHaveLength(1);
    expect(prisma.subscriptions).toHaveLength(1);
    expect(prisma.subscriptions[0].status).toBe('trialing');
    expect(prisma.subscriptions[0].trialEndsAt).toBeInstanceOf(Date);
    expect(prisma.users[0].passwordHash).not.toBe('longpass1');
  });

  it('register with an existing email throws EMAIL_ALREADY_EXISTS and creates nothing', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({ tenantName: 'Acme', email: 'dup@b.com', password: 'longpass1' });
    const before = prisma.users.length;
    await expect(
      svc.register({ tenantName: 'X', email: 'dup@b.com', password: 'longpass1' }),
    ).rejects.toMatchObject({ response: { error: 'EMAIL_ALREADY_EXISTS' } });
    expect(prisma.users).toHaveLength(before);
  });

  it('login returns tokens for valid credentials', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    const out = await svc.login({ email: 'a@b.com', password: 'longpass1' });
    expect(out.accessToken).toContain('acc.');
  });

  it('login with a wrong password throws INVALID_CREDENTIALS', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    await expect(svc.login({ email: 'a@b.com', password: 'WRONG' })).rejects.toMatchObject({
      response: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('login with an unknown email throws the same INVALID_CREDENTIALS', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await expect(svc.login({ email: 'ghost@b.com', password: 'x' })).rejects.toMatchObject({
      response: { error: 'INVALID_CREDENTIALS' },
    });
  });

  it('refresh rotates: the old refresh token is rejected after a refresh', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    const first = await svc.register({ tenantName: 'Acme', email: 'a@b.com', password: 'longpass1' });
    const rotated = await svc.refresh({ refreshToken: first.refreshToken });
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    // reusing the now-superseded token fails
    await expect(svc.refresh({ refreshToken: first.refreshToken })).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH_TOKEN' },
    });
  });
});