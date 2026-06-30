import { buildQuestions } from './build-questions';
import type { BrandAnalysisResult } from './types';

function analysis(partial: Partial<BrandAnalysisResult> = {}): BrandAnalysisResult {
  return {
    source: 'website',
    fetchStatus: { website: 'ok', accounts: [] },
    tone: 'professional',
    products: ['x'],
    audience: 'smb',
    keywords: ['k'],
    suggestedTopics: ['tips', 'news'],
    suggestedCompetitors: ['c-a'],
    confidence: 0.8,
    notes: [],
    ...partial,
  };
}

describe('buildQuestions', () => {
  it('always emits exactly one question per field (tone, prohibitions, competitors, goals, topics)', () => {
    const qs = buildQuestions(analysis());
    expect(qs.map((q) => q.field).sort()).toEqual(
      ['competitors', 'goals', 'prohibitions', 'tone', 'topics'].sort(),
    );
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length); // unique ids
  });

  it('topics question is always required (customer leads the axes)', () => {
    const topics = buildQuestions(analysis()).find((q) => q.field === 'topics')!;
    expect(topics.required).toBe(true);
    expect(topics.kind).toBe('multi');
    expect(topics.suggestions).toEqual(['tips', 'news']);
  });

  it('a field with a confident value becomes a single/multi suggestion question', () => {
    const tone = buildQuestions(analysis()).find((q) => q.field === 'tone')!;
    expect(tone.kind).toBe('single');
    expect(tone.suggestions).toEqual(['professional']);
    expect(tone.required).toBe(true);
  });

  it('manual flow: empty tone with low confidence becomes a required text question', () => {
    const a = analysis({ tone: '', confidence: 0.2, source: 'manual' });
    const tone = buildQuestions(a).find((q) => q.field === 'tone')!;
    expect(tone.kind).toBe('text');
    expect(tone.required).toBe(true);
    expect(tone.suggestions).toBeUndefined();
  });

  it('empty suggestedCompetitors yields a non-required text question', () => {
    const a = analysis({ suggestedCompetitors: [] });
    const comp = buildQuestions(a).find((q) => q.field === 'competitors')!;
    expect(comp.kind).toBe('text');
    expect(comp.required).toBe(false);
  });

  it('uses field name as id', () => {
    const qs = buildQuestions(analysis());
    expect(qs.find((q) => q.field === 'topics')!.id).toBe('topics');
  });
});
