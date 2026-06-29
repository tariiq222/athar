/**
 * Image decision gate — pure math + real-call harness.
 *
 * The gate measures whether gpt-image can render Arabic text accurately.
 * If the breakage rate is < 10% the engine uses gpt-image as primary.
 * Otherwise it uses programmatic overlay (Satori+Sharp).
 *
 * The math here is the only thing pinned by tests; the real-call runner
 * (sampleGenerations + verifySample) is the manual harness used at the
 * gate checkpoint.
 */

export interface GateSample {
  intendedText: string;
  verifiedText: string;
  broken: boolean;
}

export interface GateDecision {
  primaryMethod: 'gpt-image' | 'overlay';
  gptImageMaxAttempts: number;
}

// Arabic-aware normalization: strip tatweel, diacritics, normalize alef/ya/ta-marbuta,
// collapse whitespace. Used to compare intended vs vision-read text.
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ـ]/g, '') // tatweel
    .replace(/[ً-ْٰ]/g, '') // harakat
    .replace(/[آأإ]/g, 'ا') // alef variants -> alef
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/\s+/g, ' ')
    .trim();
}

export function isArabicTextBroken(intended: string, verified: string): boolean {
  return normalizeArabic(intended) !== normalizeArabic(verified);
}

export function computeBreakageRate(samples: GateSample[]): number {
  if (samples.length === 0) return 0;
  const broken = samples.filter((s) => s.broken).length;
  return broken / samples.length;
}

/**
 * The committed decision rule from doc 16:
 * breakage < 10%  -> gpt-image (3 retries), overlay as fallback
 * breakage >= 10% -> overlay as primary, gpt-image disabled
 */
export function decideMethod(rate: number): GateDecision {
  if (rate < 0.1) {
    return { primaryMethod: 'gpt-image', gptImageMaxAttempts: 3 };
  }
  return { primaryMethod: 'overlay', gptImageMaxAttempts: 0 };
}

/**
 * Real-call harness entry point. Not unit-tested — run manually:
 *   OPENROUTER_API_KEY=... npx ts-node src/engine/image/image-gate.ts
 *
 * Generates 20 sample generations on GPT-5-image, reads each back with
 * a vision model, computes the breakage rate, prints the decision.
 */
export async function runGate(): Promise<{
  decision: GateDecision;
  samples: GateSample[];
  rate: number;
}> {
  // Stub: the actual implementation lives in image-gate.runner.ts (not committed
  // to keep tests offline). See README in src/engine/image for the manual recipe.
  throw new Error(
    'runGate() must be invoked via the manual harness (src/engine/image/image-gate.runner.ts). ' +
      'See docs/decisions/image-gate.md for the procedure.',
  );
}