export type Platform = 'linkedin' | 'x';

export interface FetchStatus {
  website?: 'ok' | 'failed' | 'skipped';
  accounts: { platform: Platform; status: 'ok' | 'failed' | 'skipped' }[];
}

export interface BrandAnalysisResult {
  source: 'website' | 'accounts' | 'mixed' | 'manual';
  fetchStatus: FetchStatus;
  tone: string;
  products: string[];
  audience: string;
  keywords: string[];
  suggestedTopics: string[];
  suggestedCompetitors: string[];
  confidence: number; // 0..1
  notes: string[]; // warnings, e.g. site fetch failed
}

export type ConfirmationField = 'tone' | 'prohibitions' | 'competitors' | 'goals' | 'topics';

export interface ConfirmationQuestion {
  id: string;
  field: ConfirmationField;
  prompt: string; // Arabic user-facing text
  kind: 'single' | 'multi' | 'text';
  suggestions?: string[];
  required: boolean;
}

export interface ConfirmationAnswer {
  questionId: string;
  field: ConfirmationField;
  value: string | string[];
}

export interface AnalyzeResponse {
  analysis: BrandAnalysisResult;
  questions: ConfirmationQuestion[];
}
