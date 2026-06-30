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
 * Real-call harness entry point. The implementation lives in
 * `./image-gate.runner` (`runImageGate`), which is dependency-injected so it
 * can be unit-tested with mocked provider + verifier and never makes a real
 * network call by itself. To run the gate against real images, wire the
 * OpenAI-backed `OpenAiImageClient` + `VisionVerifier` into `runImageGate`
 * from a manual script. See docs/decisions/image-gate.md for the procedure.
 *
 * @deprecated Call `runImageGate(options)` from `./image-gate.runner` directly.
 */
export async function runGate(): Promise<{
  decision: GateDecision;
  samples: GateSample[];
  rate: number;
}> {
  throw new Error(
    'runGate() is superseded by runImageGate() in src/engine/image/image-gate.runner.ts. ' +
      'Wire a real GateImageGenerator + GateVisionVerifier and call runImageGate({...}). ' +
      'See docs/decisions/image-gate.md for the procedure.',
  );
}
