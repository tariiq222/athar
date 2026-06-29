import type { ContentProvider } from './providers/content-provider.interface';
import type { Draft, FactSet } from './types';
import { EngineError } from './types';
import type {
  EngineErrorKind,
  PipelineResult,
  MonthPlanProgress,
  QuotaStatus,
} from './types';

describe('engine seams', () => {
  it('a ContentProvider stub satisfies the interface', () => {
    const stub: ContentProvider = {
      draft: async () => ({ text: '', citations: [], hashtags: [], imageBrief: '' } as Draft),
      critique: async () => ({ score: 1, passed: true, issues: [] }),
      summarize: async () => ({
        tone: '', products: [], audience: '', keywords: [],
        suggestedTopics: [], suggestedCompetitors: [], colors: [],
        visualStyle: '', confidence: 0,
      }),
    };
    expect(typeof stub.draft).toBe('function');
    const fs: FactSet = { hasFactualClaim: false, facts: [] };
    expect(fs.facts).toHaveLength(0);
  });
});

describe('engine phase-1 types', () => {
  it('EngineError carries a discriminating kind', () => {
    const e = new EngineError('quota hit', 'skipped_quota');
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe<EngineErrorKind>('skipped_quota');
    expect(e.message).toBe('quota hit');
  });

  it('PipelineResult and MonthPlanProgress shapes compile', () => {
    const r: PipelineResult = {
      postId: 'p1',
      quotaStatus: 'ok' as QuotaStatus,
      critiqueIssues: [],
      imageMethod: 'gpt-image',
    };
    const p: MonthPlanProgress = {
      total: 5,
      completed: 1,
      failed: 0,
      skippedQuota: 0,
      status: 'running',
    };
    expect(r.postId).toBe('p1');
    expect(p.total).toBe(5);
  });
});