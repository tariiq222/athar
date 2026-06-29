import { Injectable } from '@nestjs/common';
import { isDomainAllowed } from '../../config/trusted-sources';

export type HttpGet = (url: string) => Promise<string>;

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

const defaultHttpGet: HttpGet = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/**
 * Fetches a URL only if its domain is in the supplied whitelist, then strips
 * HTML down to title + plain text. Returns null (does NOT throw) for
 * non-whitelisted URLs or fetch failures, so the caller treats them as
 * "no source" without disrupting the pipeline.
 */
@Injectable()
export class SourceFetcher {
  constructor(private readonly httpGet: HttpGet = defaultHttpGet) {}

  async fetchPage(url: string, whitelist: string[]): Promise<FetchedPage | null> {
    if (!isDomainAllowed(url, whitelist)) return null;
    try {
      const html = await this.httpGet(url);
      const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { url, title, text };
    } catch {
      return null;
    }
  }
}