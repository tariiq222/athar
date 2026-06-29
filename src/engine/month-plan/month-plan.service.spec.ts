import { MonthPlanService } from './month-plan.service';

const add = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest
    .fn()
    .mockImplementation(() => ({ add: (...a: unknown[]) => add(...a) })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

const request: any = {
  brandProfile: { id: 'bp', tenantId: 'tn', topics: ['eco'] },
  platform: 'linkedin',
  contentType: 'informational',
};

describe('MonthPlanService', () => {
  beforeEach(() => add.mockReset());

  it('creates a MonthPlan row and enqueues a job', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'mp-1' });
    const prisma = {
      monthPlan: { create, findUniqueOrThrow: jest.fn() },
    } as any;
    add.mockResolvedValue({});
    const svc = new MonthPlanService(
      prisma,
      { process: jest.fn() } as any,
      { get: () => 'redis://localhost:6379' } as any,
    );
    const res = await svc.enqueue({
      tenantId: 'tn',
      request,
      count: 5,
      monthStartIso: '2026-07-01T00:00:00.000Z',
    });
    expect(res).toEqual({ monthPlanId: 'mp-1' });
    expect(create).toHaveBeenCalledWith({
      data: { tenantId: 'tn', total: 5, status: 'queued' },
    });
    expect(add).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({ monthPlanId: 'mp-1', count: 5 }),
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('reads progress from the MonthPlan row', async () => {
    const prisma = {
      monthPlan: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          total: 5,
          completed: 2,
          failed: 1,
          skippedQuota: 1,
          status: 'running',
        }),
      },
    } as any;
    const svc = new MonthPlanService(
      prisma,
      { process: jest.fn() } as any,
      { get: () => 'redis://localhost:6379' } as any,
    );
    expect(await svc.getProgress('mp-1')).toEqual({
      total: 5,
      completed: 2,
      failed: 1,
      skippedQuota: 1,
      status: 'running',
    });
  });
});