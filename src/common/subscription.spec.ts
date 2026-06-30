import { latestSubscription, SubscriptionFindFirstClient } from './subscription';

function fakeClient(findFirst: jest.Mock): SubscriptionFindFirstClient {
  return { subscription: { findFirst } } as unknown as SubscriptionFindFirstClient;
}

describe('latestSubscription', () => {
  it('queries by tenantId ordered by createdAt desc (exact-match case)', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 's1' });
    const client = fakeClient(findFirst);

    const r = await latestSubscription(client, 't1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(r).toEqual({ id: 's1' });
  });

  it('merges extraWhere after tenantId without dropping it', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const client = fakeClient(findFirst);

    await latestSubscription(client, 't1', {
      extraWhere: { status: { not: 'canceled' } },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1', status: { not: 'canceled' } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('passes select through when projecting columns', async () => {
    const findFirst = jest.fn().mockResolvedValue({ status: 'active' });
    const client = fakeClient(findFirst);

    await latestSubscription(client, 't1', {
      select: { status: true, plan: true, trialEndsAt: true },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      select: { status: true, plan: true, trialEndsAt: true },
    });
  });

  it('returns null when no row matches', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const r = await latestSubscription(fakeClient(findFirst), 't1');
    expect(r).toBeNull();
  });
});
