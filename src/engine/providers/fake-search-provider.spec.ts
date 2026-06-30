import { FakeSearchProvider } from './fake-search-provider';
import { FakeContentProvider } from './fake-content-provider';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from './provider.tokens';

describe('engine seam extensions', () => {
  it('FakeSearchProvider.fetch returns ok for a normal url', async () => {
    const sp = new FakeSearchProvider();
    const res = await sp.fetch({ url: 'https://example.com' });
    expect(res.ok).toBe(true);
    expect(typeof res.text).toBe('string');
  });

  it('FakeSearchProvider.fetch fails for a url containing "fail"', async () => {
    const sp = new FakeSearchProvider();
    const res = await sp.fetch({ url: 'https://fail.example.com' });
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.text).toBeUndefined();
  });

  it('FakeContentProvider.summarize returns a structured summary', async () => {
    const cp = new FakeContentProvider();
    const out = await cp.summarize({ texts: ['hello world'], goal: 'brand-analysis' });
    expect(out.tone.length).toBeGreaterThan(0);
    expect(Array.isArray(out.suggestedTopics)).toBe(true);
    expect(out.confidence).toBeGreaterThan(0);
  });

  it('FakeContentProvider.summarize returns low confidence for empty input', async () => {
    const cp = new FakeContentProvider();
    const out = await cp.summarize({ texts: [], goal: 'brand-analysis' });
    expect(out.confidence).toBeLessThan(0.4);
    expect(out.suggestedTopics).toEqual([]);
  });

  it('exposes DI tokens bound to EngineModule string keys', () => {
    // These tokens must match the bindings in src/engine/engine.module.ts
    // so BrandModule and EngineModule share the same provider resolution.
    expect(CONTENT_PROVIDER).toBe('ContentProvider');
    expect(SEARCH_PROVIDER).toBe('SearchProvider');
  });
});
