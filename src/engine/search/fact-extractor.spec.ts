import { FactExtractor } from './fact-extractor';

const page = { url: 'https://reuters.com/x', title: 'Reuters', text: 'GDP grew 4%.' };

describe('FactExtractor', () => {
  it('maps model claims onto the real source url/title', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ claim: 'GDP grew 4%', confidence: 0.9 }]),
        inputTokens: 5,
        outputTokens: 5,
      }),
    } as any;
    const ex = new FactExtractor(claude);
    const facts = await ex.extract(page, 'economy');
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
    } as any;
    const ex = new FactExtractor(claude);
    expect(await ex.extract(page, 'economy')).toEqual([]);
  });

  it('drops items missing a claim and clamps confidence to 0..1', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([{ confidence: 0.5 }, { claim: 'x', confidence: 9 }]),
        inputTokens: 1,
        outputTokens: 1,
      }),
    } as any;
    const ex = new FactExtractor(claude);
    const facts = await ex.extract(page, 't');
    expect(facts).toEqual([
      {
        claim: 'x',
        sourceUrl: page.url,
        sourceTitle: page.title,
        confidence: 1,
      },
    ]);
  });
});