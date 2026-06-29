import { UsageRecorder } from './usage.recorder';

describe('UsageRecorder', () => {
  it('writes a UsageRecord row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { usageRecord: { create, aggregate: jest.fn() } } as any;
    const rec = new UsageRecorder(prisma);
    await rec.record({ tenantId: 'tn', kind: 'text', units: 3, costUsd: 0.02 });
    expect(create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tn',
        kind: 'text',
        units: 3,
        costUsd: 0.02,
        subscriptionId: undefined,
      },
    });
  });

  it('isOverQuota is true at or above the cap', async () => {
    process.env.ENGINE_MONTHLY_UNIT_CAP = '10';
    const aggregate = jest.fn().mockResolvedValue({ _sum: { units: 10 } });
    const prisma = { usageRecord: { create: jest.fn(), aggregate } } as any;
    const rec = new UsageRecorder(prisma);
    expect(await rec.isOverQuota('tn')).toBe(true);
    delete process.env.ENGINE_MONTHLY_UNIT_CAP;
  });

  it('isOverQuota is false below the cap and treats null sum as 0', async () => {
    process.env.ENGINE_MONTHLY_UNIT_CAP = '10';
    const aggregate = jest.fn().mockResolvedValue({ _sum: { units: null } });
    const prisma = { usageRecord: { create: jest.fn(), aggregate } } as any;
    const rec = new UsageRecorder(prisma);
    expect(await rec.isOverQuota('tn')).toBe(false);
    delete process.env.ENGINE_MONTHLY_UNIT_CAP;
  });
});