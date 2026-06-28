import type { ContentProvider } from './providers/content-provider.interface';
import type { Draft, FactSet } from './types';

describe('engine seams', () => {
  it('a ContentProvider stub satisfies the interface', () => {
    const stub: ContentProvider = {
      draft: async () => ({ text: '', citations: [], hashtags: [], imageBrief: '' } as Draft),
      critique: async () => ({ score: 1, passed: true, issues: [] }),
    };
    expect(typeof stub.draft).toBe('function');
    const fs: FactSet = { hasFactualClaim: false, facts: [] };
    expect(fs.facts).toHaveLength(0);
  });
});