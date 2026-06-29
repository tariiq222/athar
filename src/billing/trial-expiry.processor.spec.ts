import { TrialExpiryProcessor } from './trial-expiry.processor';

describe('TrialExpiryProcessor', () => {
  it('transitions expired trialing subscriptions to past_due', async () => {
    const updates: any[] = [];
    const prisma = {
      subscription: {
        findMany: jest.fn(async () => [{ id: 's1', tenantId: 't1', status: 'trialing', trialEndsAt: new Date(Date.now() - 1000) }]),
        update: jest.fn(async ({ where, data }: any) => { updates.push({ where, data }); return { where, data }; }),
      },
    } as any;
    const proc = new TrialExpiryProcessor(prisma);
    const n = await proc.runOnce();
    expect(n).toBe(1);
    expect(updates[0]).toEqual({ where: { id: 's1' }, data: { status: 'past_due' } });
  });

  it('skips active subscriptions', async () => {
    const prisma = {
      subscription: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    } as any;
    const proc = new TrialExpiryProcessor(prisma);
    const n = await proc.runOnce();
    expect(n).toBe(0);
  });
});