import { PipelineService } from './pipeline.service';
import { PlatformLimitExceeded } from '../assemble/assemble.stage';
import { EngineError } from '../types';
import type { GenerationRequest } from '../types';

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
    usage: { isOverQuota: jest.fn().mockResolvedValue(false), record: jest.fn() },
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

  it('throws skipped_quota EngineError when over quota, with no provider work', async () => {
    const d = deps({
      usage: { isOverQuota: jest.fn().mockResolvedValue(true), record: jest.fn() },
    });
    await expect(make(d).generateOne(req)).rejects.toMatchObject({
      kind: 'skipped_quota',
    });
    expect(d.search.research).not.toHaveBeenCalled();
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