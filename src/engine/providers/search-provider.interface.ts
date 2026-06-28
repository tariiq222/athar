import type { FactSet, BrandProfileInput } from '../types';

export interface SearchProvider {
  research(topic: string, brand: BrandProfileInput): Promise<FactSet>;
}