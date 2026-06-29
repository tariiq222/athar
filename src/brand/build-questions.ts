import type { BrandAnalysisResult, ConfirmationQuestion } from './types';

const PROMPTS = {
  tone: 'ما النبرة التي تناسب علامتك؟',
  prohibitions: 'ما الكلمات أو المواضيع الممنوعة؟',
  competitors: 'من أبرز منافسيك؟',
  goals: 'ما هدفك من المحتوى؟',
  topics: 'حدّد محاورك (أضف أو احذف من اقتراحاتنا):',
} as const;

// Pure: derive one confirmation question per field from the analysis.
// No I/O, no deps — unit-testable in isolation.
export function buildQuestions(analysis: BrandAnalysisResult): ConfirmationQuestion[] {
  const lowConfidence = analysis.confidence < 0.4;

  // topics: always required, customer leads (AC-3). Suggestions are a starting point.
  const topics: ConfirmationQuestion = {
    id: 'topics',
    field: 'topics',
    prompt: PROMPTS.topics,
    kind: 'multi',
    suggestions: analysis.suggestedTopics,
    required: true,
  };

  const tone = scalarQuestion('tone', PROMPTS.tone, analysis.tone, lowConfidence, true);
  const goals = scalarQuestion('goals', PROMPTS.goals, analysis.audience ? '' : '', lowConfidence, true);
  const prohibitions = listQuestion('prohibitions', PROMPTS.prohibitions, [], false);
  const competitors = listQuestion(
    'competitors',
    PROMPTS.competitors,
    analysis.suggestedCompetitors,
    false,
  );

  return [tone, prohibitions, competitors, goals, topics];
}

function scalarQuestion(
  field: ConfirmationQuestion['field'],
  prompt: string,
  value: string,
  lowConfidence: boolean,
  required: boolean,
): ConfirmationQuestion {
  const hasValue = value.trim().length > 0 && !lowConfidence;
  if (!hasValue) {
    return { id: field, field, prompt, kind: 'text', required };
  }
  return { id: field, field, prompt, kind: 'single', suggestions: [value], required };
}

function listQuestion(
  field: ConfirmationQuestion['field'],
  prompt: string,
  values: string[],
  required: boolean,
): ConfirmationQuestion {
  if (values.length === 0) {
    return { id: field, field, prompt, kind: 'text', required };
  }
  return { id: field, field, prompt, kind: 'multi', suggestions: values, required };
}
