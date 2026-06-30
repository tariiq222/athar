import { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

function ctx(tenantContext?: unknown) {
  const request: any = { tenantContext };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makePrisma(
  userById: Record<string, { id: string; tenantId: string } | null> = {},
): any {
  return {
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => userById[where.id] ?? null,
      ),
    },
  };
}

describe('TenantGuard', () => {
  it('passes when user.tenantId matches context.tenantId', async () => {
    const prisma = makePrisma({ u1: { id: 'u1', tenantId: 't1' } });
    const guard = new TenantGuard(prisma);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { tenantId: true },
    });
  });

  // Sprint A — Task 2.2: tenantId-vs-user.tenantId cross-check.

  it('rejects with TENANT_MISMATCH when user.tenantId differs from context.tenantId', async () => {
    const prisma = makePrisma({ u1: { id: 'u1', tenantId: 't_evil' } });
    const guard = new TenantGuard(prisma);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', tenantId: 't1' })),
    ).rejects.toMatchObject({
      response: { error: 'TENANT_MISMATCH' },
      status: 403,
    });
  });

  it('rejects with TENANT_MISMATCH when the user does not exist in DB', async () => {
    const prisma = makePrisma({});
    const guard = new TenantGuard(prisma);
    await expect(
      guard.canActivate(ctx({ userId: 'u_missing', tenantId: 't1' })),
    ).rejects.toMatchObject({
      response: { error: 'TENANT_MISMATCH' },
      status: 403,
    });
  });

  it('rejects when context is missing (UNAUTHENTICATED)', async () => {
    const guard = new TenantGuard(makePrisma());
    let caught: unknown;
    try {
      await guard.canActivate(ctx(undefined));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { getResponse: () => unknown }).getResponse()).toMatchObject({
      error: 'UNAUTHENTICATED',
    });
    expect((caught as { getStatus: () => number }).getStatus()).toBe(401);
  });
});