import { LiveSearchProvider } from './live-search.provider';
import { EngineError } from '../types';
import type { BrandProfileInput } from '../types';
import { BUSINESS_PLAN } from '../../config/billing-plans';

const allowUsage = {
  record: jest.fn().mockResolvedValue(undefined),
  getCurrentPlan: jest.fn().mockResolvedValue(BUSINESS_PLAN),
  canConsume: jest.fn().mockResolvedValue({ allowed: true, used: 0, cap: 200 }),
};

const brand: BrandProfileInput = {
  id: 'b',
  tenantId: 'tn',
  tone: '',
  topics: ['economy'],
  prohibitions: [],
  competitors: [],
  keywords: [],
  learnedPreferences: '',
  brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
};

describe('LiveSearchProvider', () => {
  const page = { url: 'https://reuters.com/x', title: 'Reuters', text: 'GDP 4%' };

  it('fetches candidates, extracts facts, records search usage, sets hasFactualClaim=true', async () => {
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(page) } as any;
    const extractor = {
      extract: jest.fn().mockResolvedValue([
        {
          claim: 'GDP 4%',
          sourceUrl: page.url,
          sourceTitle: 'Reuters',
          confidence: 0.9,
        },
      ]),
    } as any;
    const usage = allowUsage;
    const candidates = jest.fn().mockResolvedValue(['https://reuters.com/x']);
    const p = new LiveSearchProvider(fetcher, extractor, usage as any, candidates);

    const fs = await p.research('economy', brand);
    expect(fs.hasFactualClaim).toBe(true);
    expect(fs.facts).toHaveLength(1);
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tn', kind: 'search' }),
    );
    expect(usage.canConsume).toHaveBeenCalledWith('tn', 'search', BUSINESS_PLAN);
  });

  it('returns hasFactualClaim=false with no facts when nothing trustworthy is found', async () => {
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(null) } as any;
    const extractor = { extract: jest.fn() } as any;
    const usage = allowUsage;
    const candidates = jest.fn().mockResolvedValue(['https://evil.com/a']);
    const p = new LiveSearchProvider(fetcher, extractor, usage as any, candidates);

    const fs = await p.research('economy', brand);
    expect(fs).toEqual({ hasFactualClaim: false, facts: [] });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('caps fetches at ENGINE_SEARCH_MAX_FETCHES', async () => {
    process.env.ENGINE_SEARCH_MAX_FETCHES = '2';
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(page) } as any;
    const extractor = { extract: jest.fn().mockResolvedValue([]) } as any;
    const usage = allowUsage;
    const candidates = jest
      .fn()
      .mockResolvedValue([
        'https://reuters.com/1',
        'https://reuters.com/2',
        'https://reuters.com/3',
      ]);
    const p = new LiveSearchProvider(fetcher, extractor, usage as any, candidates);

    await p.research('economy', brand);
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(2);
    delete process.env.ENGINE_SEARCH_MAX_FETCHES;
  });

  it('throws skipped_quota EngineError when search cap is denied, before any fetch', async () => {
    const fetcher = { fetchPage: jest.fn() } as any;
    const extractor = { extract: jest.fn() } as any;
    const usage = {
      record: jest.fn(),
      getCurrentPlan: jest.fn().mockResolvedValue(BUSINESS_PLAN),
      canConsume: jest
        .fn()
        .mockResolvedValue({ allowed: false, used: 200, cap: 200, reason: 'search cap hit' }),
    };
    const candidates = jest.fn().mockResolvedValue(['https://reuters.com/x']);
    const p = new LiveSearchProvider(fetcher, extractor, usage as any, candidates);

    await expect(p.research('economy', brand)).rejects.toBeInstanceOf(EngineError);
    await expect(p.research('economy', brand)).rejects.toMatchObject({
      kind: 'skipped_quota',
      message: 'search cap hit',
    });
    expect(fetcher.fetchPage).not.toHaveBeenCalled();
    expect(candidates).not.toHaveBeenCalled();
    expect(usage.record).not.toHaveBeenCalled();
  });
});