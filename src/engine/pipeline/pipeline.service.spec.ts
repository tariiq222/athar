import { PipelineService } from './pipeline.service';
import { PlatformLimitExceeded } from '../assemble/assemble.stage';
import { EngineError } from '../types';
import type { GenerationRequest } from '../types';
import { BUSINESS_PLAN } from '../../config/billing-plans';

const req: GenerationRequest = {
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
const okDraft = { text: 't', citations: [], hashtags: [], imageBrief: 'b' };

function deps(over: Record<string, any> = {}) {
  return {
    search: {
      research: jest.fn().mockResolvedValue({ hasFactualClaim: false, facts: [] }),
    },
    draftStage: { run: jest.fn().mockResolvedValue(okDraft) },
    critiqueStage: { run: jest.fn().mockResolvedValue({ draft: okDraft, issues: [] }) },
    imageProvider: {
      setTenant: jest.fn(),
      generateImage: jest.fn().mockResolvedValue({
        url: 'u',
        verifiedText: 't',
        method: 'gpt-image',
        attempts: 1,
      }),
    },
    assembleStage: { run: jest.fn().mockResolvedValue('post-1') },
    usage: {
      record: jest.fn(),
      isOverQuota: jest.fn().mockResolvedValue(false),
      getCurrentPlan: jest.fn().mockResolvedValue(BUSINESS_PLAN),
      canConsume: jest.fn().mockResolvedValue({ allowed: true, used: 0, cap: 60 }),
    },
    ...over,
  };
}
const make = (d: ReturnType<typeof deps>) =>
  new PipelineService(
    d.search as any,
    d.draftStage as any,
    d.critiqueStage as any,
    d.imageProvider as any,
    d.assembleStage as any,
    d.usage as any,
  );

describe('PipelineService', () => {
  it('runs all stages and returns ok result', async () => {
    const d = deps();
    const res = await make(d).generateOne(req);
    expect(res).toEqual({
      postId: 'post-1',
      quotaStatus: 'ok',
      critiqueIssues: [],
      imageMethod: 'gpt-image',
    });
    expect(d.imageProvider.setTenant).toHaveBeenCalledWith('tn');
  });

  it('checks canConsume for text + image and throws skipped_quota on text denial', async () => {
    const canConsume = jest
      .fn()
      .mockResolvedValueOnce({ allowed: false, used: 60, cap: 60, reason: 'text cap hit' });
    const d = deps({
      usage: {
        record: jest.fn(),
        isOverQuota: jest.fn().mockResolvedValue(false),
        getCurrentPlan: jest.fn().mockResolvedValue(BUSINESS_PLAN),
        canConsume,
      },
    });
    await expect(make(d).generateOne(req)).rejects.toMatchObject({
      kind: 'skipped_quota',
      message: 'text cap hit',
    });
    expect(d.search.research).not.toHaveBeenCalled();
    expect(canConsume).toHaveBeenCalledWith('tn', 'text', BUSINESS_PLAN);
  });

  it('checks canConsume for image after critique and throws skipped_quota on image denial', async () => {
    const canConsume = jest
      .fn()
      .mockResolvedValueOnce({ allowed: true, used: 0, cap: 60 })
      .mockResolvedValueOnce({ allowed: false, used: 30, cap: 30, reason: 'image cap hit' });
    const d = deps({
      usage: {
        record: jest.fn(),
        isOverQuota: jest.fn().mockResolvedValue(false),
        getCurrentPlan: jest.fn().mockResolvedValue(BUSINESS_PLAN),
        canConsume,
      },
    });
    await expect(make(d).generateOne(req)).rejects.toMatchObject({
      kind: 'skipped_quota',
      message: 'image cap hit',
    });
    expect(canConsume).toHaveBeenCalledWith('tn', 'text', BUSINESS_PLAN);
    expect(canConsume).toHaveBeenCalledWith('tn', 'image', BUSINESS_PLAN);
    expect(d.imageProvider.generateImage).not.toHaveBeenCalled();
  });

  it('degrades to text-only post when image generation fails with provider_error', async () => {
    const d = deps({
      imageProvider: {
        setTenant: jest.fn(),
        generateImage: jest
          .fn()
          .mockRejectedValue(new EngineError('img down', 'provider_error')),
      },
    });
    const res = await make(d).generateOne(req);
    expect(res.imageMethod).toBeNull();
    expect(d.assembleStage.run).toHaveBeenCalledWith(
      expect.objectContaining({ image: null }),
    );
  });

  it('re-drafts once with a tighter brief on PlatformLimitExceeded', async () => {
    const assembleRun = jest
      .fn()
      .mockRejectedValueOnce(new PlatformLimitExceeded(50))
      .mockResolvedValueOnce('post-2');
    const d = deps({ assembleStage: { run: assembleRun } });
    const res = await make(d).generateOne(req);
    expect(res.postId).toBe('post-2');
    expect(d.draftStage.run).toHaveBeenCalledTimes(2); // initial + tighter re-draft
    expect(assembleRun).toHaveBeenCalledTimes(2);
  });
});