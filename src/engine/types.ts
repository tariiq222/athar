import type { Platform } from '../config/platform-limits';

export type ContentType = 'informational' | 'thought' | 'announcement' | 'engagement';

export interface BrandKit {
  colors: string[];
  logoUrl?: string;
  visualStyle: string;
  font: string;
}

export interface BrandProfileInput {
  id: string;
  tenantId: string;
  tone: string;
  topics: string[];
  audience?: string;
  goals?: string;
  prohibitions: string[];
  competitors: string[];
  keywords: string[];
  brandKit: BrandKit;
  learnedPreferences: string;
}

export interface GenerationRequest {
  brandProfile: BrandProfileInput;
  platform: Platform;
  contentType: ContentType;
  brief?: string;
  topic?: string;
}

export interface Fact {
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  confidence: number;
}
export interface FactSet {
  hasFactualClaim: boolean;
  facts: Fact[];
}

export interface Citation {
  claim: string;
  sourceUrl: string;
}
export interface Draft {
  text: string;
  citations: Citation[];
  hashtags: string[];
  imageBrief: string;
}

export interface Rubric {
  toneMatch: boolean;
  sourceIntegrity: boolean;
  platformCompliance: boolean;
  prohibitions: boolean;
  clarity: boolean;
}
export interface CritiqueResult {
  score: number;
  passed: boolean;
  issues: string[];
}

export interface ImageAsset {
  url: string;
  verifiedText: string;
  method: 'gpt-image' | 'overlay-fallback';
  attempts: number;
}

// ─── Phase 1 additions ────────────────────────────────────────────────────

export type EngineErrorKind = 'provider_error' | 'skipped_quota';

export class EngineError extends Error {
  constructor(message: string, public readonly kind: EngineErrorKind) {
    super(message);
    this.name = 'EngineError';
  }
}

export type QuotaStatus = 'ok' | 'skipped_quota';

export interface PipelineResult {
  postId: string;
  quotaStatus: QuotaStatus;
  critiqueIssues: string[];
  imageMethod: ImageAsset['method'] | null;
}

export interface MonthPlanProgress {
  total: number;
  completed: number;
  failed: number;
  skippedQuota: number;
  status: 'queued' | 'running' | 'done';
}