import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

type Row = Record<string, any>;

function makePrismaMock() {
  const users: Row[] = [];
  const tenants: Row[] = [];
  const subscriptions: Row[] = [];
  const auditLogs: Row[] = [];
  const tx = {
    tenant: { create: async ({ data }: any) => { const t = { id: 't' + (tenants.length + 1), ...data }; tenants.push(t); return t; } },
    user: { create: async ({ data }: any) => { const u = { id: 'u' + (users.length + 1), ...data }; users.push(u); return u; } },
    subscription: { create: async ({ data }: any) => { const s = { id: 's' + (subscriptions.length + 1), ...data }; subscriptions.push(s); return s; } },
  };
  return {
    users,
    tenants,
    subscriptions,
    auditLogs,
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
    auditLog: {
      create: async ({ data }: any) => { const a = { id: 'a' + (auditLogs.length + 1), ...data }; auditLogs.push(a); return a; },
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
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new AuthService(prisma, passwords, tokens as any, config, audit as any);
  return { svc, tokens, passwords, audit };
}

describe('AuthService', () => {
  it('register creates tenant+user+subscription atomically and returns tokens', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    const out = await svc.register({
      tenantName: 'Acme',
      email: 'a@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
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
    await svc.register({
      tenantName: 'Acme',
      email: 'dup@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    const before = prisma.users.length;
    await expect(
      svc.register({
        tenantName: 'X',
        email: 'dup@b.com',
        password: 'longpass1',
        acceptTerms: true,
        termsVersion: 'v1',
      }),
    ).rejects.toMatchObject({ response: { error: 'EMAIL_ALREADY_EXISTS' } });
    expect(prisma.users).toHaveLength(before);
  });

  it('login returns tokens for valid credentials', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({
      tenantName: 'Acme',
      email: 'a@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    const out = await svc.login({ email: 'a@b.com', password: 'longpass1' });
    expect(out.accessToken).toContain('acc.');
  });

  it('login with a wrong password throws INVALID_CREDENTIALS', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    await svc.register({
      tenantName: 'Acme',
      email: 'a@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
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
    const first = await svc.register({
      tenantName: 'Acme',
      email: 'a@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    const rotated = await svc.refresh({ refreshToken: first.refreshToken });
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    // reusing the now-superseded token fails
    await expect(svc.refresh({ refreshToken: first.refreshToken })).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH_TOKEN' },
    });
  });

  // Sprint A — Task 4.1: PDPL consent capture + audit log.

  it('register persists consentGivenAt and consentVersion on the user row', async () => {
    const prisma = makePrismaMock();
    const { svc } = makeService(prisma);
    const before = Date.now();
    await svc.register({
      tenantName: 'Acme',
      email: 'consent@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    const after = Date.now();
    const u = prisma.users[0];
    expect(u.consentGivenAt).toBeInstanceOf(Date);
    expect(u.consentGivenAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(u.consentGivenAt.getTime()).toBeLessThanOrEqual(after);
    expect(u.consentVersion).toBe('v1');
  });

  it('register writes an auth.register audit log entry', async () => {
    const prisma = makePrismaMock();
    const { svc, audit } = makeService(prisma);
    await svc.register({
      tenantName: 'Acme',
      email: 'audit@b.com',
      password: 'longpass1',
      acceptTerms: true,
      termsVersion: 'v1',
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith({
      tenantId: 't1',
      userId: 'u1',
      action: 'auth.register',
      metadata: { termsVersion: 'v1' },
    });
  });

  it('login timing-equalizer: passwords.hash is called even when user does not exist', async () => {
    const prisma = makePrismaMock();
    const { svc, passwords } = makeService(prisma);
    const hashSpy = jest.spyOn(passwords, 'hash');
    await expect(svc.login({ email: 'ghost@b.com', password: 'anything' })).rejects.toMatchObject({
      response: { error: 'INVALID_CREDENTIALS' },
    });
    // Equalize the timing between "user not found" and "wrong password" by
    // burning one hash cycle on the missing-user path.
    expect(hashSpy).toHaveBeenCalled();
  });
});