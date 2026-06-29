import type {
  FactSet,
  BrandProfileInput,
  ContentType,
  Draft,
  Rubric,
  CritiqueResult,
} from '../types';
import type { Platform } from '../../config/platform-limits';

export interface DraftInput {
  factSet: FactSet;
  brand: BrandProfileInput;
  platform: Platform;
  contentType: ContentType;
  brief?: string;
}

export interface SummarizeInput {
  texts: string[];          // raw page/profile texts fetched from public sources
  goal: 'brand-analysis';
}

export interface SummaryResult {
  tone: string;
  products: string[];
  audience: string;
  keywords: string[];
  suggestedTopics: string[];
  suggestedCompetitors: string[];
  colors: string[];         // extracted from site for brandKit
  logoUrl?: string;
  visualStyle: string;
  confidence: number;       // 0..1 quality of the summary
}

export interface ContentProvider {
  draft(input: DraftInput): Promise<Draft>;
  critique(draft: Draft, rubric: Rubric): Promise<CritiqueResult>;
  summarize(input: SummarizeInput): Promise<SummaryResult>;
}
