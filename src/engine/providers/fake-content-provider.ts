import type { ContentProvider, DraftInput, SummarizeInput, SummaryResult } from './content-provider.interface';
import type { Draft, Rubric, CritiqueResult } from '../types';

// Deterministic double for tests/dev. Empty input -> low confidence, empty suggestions.
export class FakeContentProvider implements ContentProvider {
  async draft(_input: DraftInput): Promise<Draft> {
    return { text: '', citations: [], hashtags: [], imageBrief: '' };
  }

  async critique(_draft: Draft, _rubric: Rubric): Promise<CritiqueResult> {
    return { score: 1, passed: true, issues: [] };
  }

  async summarize(input: SummarizeInput): Promise<SummaryResult> {
    const empty = input.texts.length === 0;
    return {
      tone: empty ? '' : 'professional and approachable',
      products: empty ? [] : ['service'],
      audience: empty ? '' : 'small businesses',
      keywords: empty ? [] : ['growth'],
      suggestedTopics: empty ? [] : ['industry insights', 'tips'],
      suggestedCompetitors: empty ? [] : ['competitor-a'],
      colors: empty ? [] : ['#1A73E8'],
      logoUrl: undefined,
      visualStyle: empty ? '' : 'clean, modern',
      confidence: empty ? 0.2 : 0.8,
    };
  }
}
