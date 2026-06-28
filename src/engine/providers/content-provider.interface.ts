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

export interface ContentProvider {
  draft(input: DraftInput): Promise<Draft>;
  critique(draft: Draft, rubric: Rubric): Promise<CritiqueResult>;
}