import { FactExtractor } from './fact-extractor';
import { TenantContextService } from '../../common/tenant-context.service';

const page = { url: 'https://reuters.com/x', title: 'Reuters', text: 'GDP grew 4%.' };

function makeExtractor(claude: any) {
  const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const tenantContext = new TenantContextService();
  return { ex: new FactExtractor(claude, usage, tenantContext), usage, tenantContext };
}

describe('FactExtractor', () => {
  it('maps model claims onto the real source url/title', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ claim: 'GDP grew 4%', confidence: 0.9 }]),
        inputTokens: 5,
        outputTokens: 5,
      }),
      model: 'claude-3-5-sonnet',
    } as any;
    const { ex, tenantContext } = makeExtractor(claude);
    const facts = await tenantContext.runWithTenant('tn', () => ex.extract(page, 'economy'));
    expect(facts).toEqual([
      {
        claim: 'GDP grew 4%',
        sourceUrl: 'https://reuters.com/x',
        sourceTitle: 'Reuters',
        confidence: 0.9,
      },
    ]);
  });

  it('returns [] on non-JSON model output (no fabrication)', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: 'not json',
        inputTokens: 1,
        outputTokens: 1,
      }),
      model: 'claude-3-5-sonnet',
    } as any;
    const { ex, tenantContext } = makeExtractor(claude);
    expect(await tenantContext.runWithTenant('tn', () => ex.extract(page, 'economy'))).toEqual([]);
  });

  it('drops items missing a claim and clamps confidence to 0..1', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ confidence: 0.5 }, { claim: 'x', confidence: 9 }]),
        inputTokens: 1,
        outputTokens: 1,
      }),
      model: 'claude-3-5-sonnet',
    } as any;
    const { ex, tenantContext } = makeExtractor(claude);
    const facts = await tenantContext.runWithTenant('tn', () => ex.extract(page, 't'));
    expect(facts).toEqual([
      {
        claim: 'x',
        sourceUrl: page.url,
        sourceTitle: page.title,
        confidence: 1,
      },
    ]);
  });

  it('records a text UsageRecord with the active tenantId and computed cost', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ claim: 'ok', confidence: 1 }]),
        inputTokens: 1000,
        outputTokens: 500,
      }),
      model: 'claude-3-5-sonnet',
    } as any;
    const { ex, usage, tenantContext } = makeExtractor(claude);
    await tenantContext.runWithTenant('tn', () => ex.extract(page, 't'));
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tn',
        kind: 'text',
        units: 1500,
        costUsd: expect.closeTo(0.003 + 0.0075, 6),
      }),
    );
  });
});
