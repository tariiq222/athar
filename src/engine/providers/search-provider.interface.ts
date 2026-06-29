import type { FactSet, BrandProfileInput } from '../types';

export interface FetchInput {
  url: string;              // public website page or social profile url
}

export interface FetchResult {
  ok: boolean;
  text?: string;            // extracted text when ok
  error?: string;           // reason when not ok
}

export interface SearchProvider {
  research(topic: string, brand: BrandProfileInput): Promise<FactSet>;
  fetch(input: FetchInput): Promise<FetchResult>;
}