import type { SearchProvider } from './search-provider.interface';
import type { FetchInput, FetchResult } from './search-provider.interface';
import type { FactSet, BrandProfileInput } from '../types';

// Deterministic double: any url containing "fail" simulates an unreachable source.
export class FakeSearchProvider implements SearchProvider {
  async research(_topic: string, _brand: BrandProfileInput): Promise<FactSet> {
    return { hasFactualClaim: false, facts: [] };
  }

  async fetch(input: FetchInput): Promise<FetchResult> {
    if (input.url.includes('fail')) {
      return { ok: false, error: 'unreachable' };
    }
    return { ok: true, text: `content of ${input.url}` };
  }
}
