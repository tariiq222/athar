import { MonthPlanProcessor } from './month-plan.processor';
import { EngineError } from '../types';
import type { GenerationRequest } from '../types';

const request: GenerationRequest = {
  brandProfile: {
    id: 'bp',
    tenantId: 'tn',
    tone: '',
    topics: ['eco'],
    prohibitions: [],
    competitors: [],
    keywords: [],
    learnedPreferences: '',
    brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
  },
  platform: 'linkedin',
  contentType: 'informational',
};
const data = {
  monthPlanId: 'mp',
  tenantId: 'tn',
  request,
  count: 3,
  monthStartIso: '2026-07-01T00:00:00.000Z',
};

function prismaMock() {
  return { monthPlan: { update: jest.fn().mockResolvedValue({}) } } as any;
}

describe('MonthPlanProcessor', () => {
  it('runs the pipeline per slot and reports completion progress', async () => {
    const pipeline = {
      generateOne: jest.fn().mockResolvedValue({
        postId: 'p',
        quotaStatus: 'ok',
        critiqueIssues: [],
        imageMethod: 'gpt-image',
      }),
    } as any;
    const prisma = prismaMock();
    const updateProgress = jest.fn().mockResolvedValue(undefined);
    const proc = new MonthPlanProcessor(pipeline, prisma);
    const res = await proc.process(data, updateProgress);
    expect(res).toEqual({
      total: 3,
      completed: 3,
      failed: 0,
      skippedQuota: 0,
      status: 'done',
    });
    expect(updateProgress).toHaveBeenLastCalledWith(100);
  });

  it('marks skipped_quota and continues without counting it as failed', async () => {
    const pipeline = {
      generateOne: jest
        .fn()
        .mockResolvedValueOnce({
          postId: 'p1',
          quotaStatus: 'ok',
          critiqueIssues: [],
          imageMethod: null,
        })
        .mockRejectedValue(new EngineError('cap', 'skipped_quota')),
    } as any;
    const proc = new MonthPlanProcessor(pipeline, prismaMock());
    const res = await proc.process(data, jest.fn().mockResolvedValue(undefined));
    expect(res).toEqual({
      total: 3,
      completed: 1,
      failed: 0,
      skippedQuota: 2,
      status: 'done',
    });
  });

  it('counts provider_error as failed but still finishes the plan', async () => {
    const pipeline = {
      generateOne: jest
        .fn()
        .mockResolvedValueOnce({
          postId: 'p1',
          quotaStatus: 'ok',
          critiqueIssues: [],
          imageMethod: null,
        })
        .mockRejectedValueOnce(new EngineError('down', 'provider_error'))
        .mockResolvedValueOnce({
          postId: 'p3',
          quotaStatus: 'ok',
          critiqueIssues: [],
          imageMethod: null,
        }),
    } as any;
    const proc = new MonthPlanProcessor(pipeline, prismaMock());
    const res = await proc.process(data, jest.fn().mockResolvedValue(undefined));
    expect(res).toEqual({
      total: 3,
      completed: 2,
      failed: 1,
      skippedQuota: 0,
      status: 'done',
    });
  });
});