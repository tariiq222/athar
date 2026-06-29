import { Injectable } from '@nestjs/common';
import type { SearchProvider, FetchInput, FetchResult } from '../providers/search-provider.interface';
import type { FactSet, Fact, BrandProfileInput } from '../types';
import { SourceFetcher } from './source-fetcher';
import { FactExtractor } from './fact-extractor';
import { UsageRecorder } from '../usage/usage.recorder';
import { buildWhitelist } from '../../config/trusted-sources';

export type CandidateUrlProvider = (
  topic: string,
  whitelist: string[],
) => Promise<string[]>;

/**
 * The real SearchProvider. Caps fetches per post (margin protection),
 * uses the whitelist derived from the brand, records a `UsageRecord`
 * of kind `search`, and returns `hasFactualClaim=false` with zero facts
 * when nothing trustworthy is found — never fabricates sources.
 *
 * The `candidateUrls` callable is injected so the real web-search impl
 * (Task 16 — restricted to whitelist domains) can be swapped in later
 * without touching this class.
 */
@Injectable()
export class LiveSearchProvider implements SearchProvider {
  constructor(
    private readonly fetcher: SourceFetcher,
    private readonly extractor: FactExtractor,
    private readonly usage: UsageRecorder,
    private readonly candidateUrls: CandidateUrlProvider,
  ) {}

  async research(topic: string, brand: BrandProfileInput): Promise<FactSet> {
    const whitelist = buildWhitelist(brand);
    const maxFetches = Number(process.env.ENGINE_SEARCH_MAX_FETCHES ?? 5);

    const urls = (await this.candidateUrls(topic, whitelist)).slice(0, maxFetches);
    let fetches = 0;
    const facts: Fact[] = [];

    for (const url of urls) {
      if (fetches >= maxFetches) break;
      fetches += 1;
      const page = await this.fetcher.fetchPage(url, whitelist);
      if (!page) continue;
      const extracted = await this.extractor.extract(page, topic);
      facts.push(...extracted);
    }

    await this.usage.record({
      tenantId: brand.tenantId,
      kind: 'search',
      units: fetches,
      costUsd: 0,
    });

    return facts.length > 0
      ? { hasFactualClaim: true, facts }
      : { hasFactualClaim: false, facts: [] };
  }

  async fetch(_input: FetchInput): Promise<FetchResult> {
    throw new Error('fetch: not implemented (brand phase requires real impl in a future phase)');
  }
}
