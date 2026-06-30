/**
 * 20-image-gate runner harness.
 *
 * Drives N gpt-image generations of Arabic-text image briefs, reads each
 * rendered image back with a vision verifier, measures the Arabic-text
 * breakage rate, and emits the committed decision (gpt-image primary vs
 * overlay base) via the EXISTING decision functions in `./image-gate`.
 *
 * The runner is fully dependency-injected: it takes a `GateImageGenerator`
 * and a `GateVisionVerifier` so it can be unit-tested with mocks and never
 * makes a real network / OpenAI call by itself. The real OpenAI-backed
 * implementations (OpenAiImageClient + VisionVerifier) live under
 * `src/engine/providers/openai/` and structurally satisfy these seams.
 */

import {
  type GateSample,
  type GateDecision,
  computeBreakageRate,
  decideMethod,
  isArabicTextBroken,
} from './image-gate';

/**
 * Produces raw image bytes for a single Arabic-text brief. Mirrors the
 * low-level `OpenAiImageClient.generate(prompt, size)` seam but is reduced
 * to "given a brief, give me bytes" so the gate harness owns prompt shaping.
 */
export interface GateImageGenerator {
  generate(brief: string): Promise<Buffer>;
}

/**
 * Reads Arabic text back out of image bytes and reports whether it matches
 * the intended text. Same shape as the real `VisionVerifier.verify`.
 */
export interface GateVisionVerifier {
  verify(bytes: Buffer, intendedText: string): Promise<{ verifiedText: string; matches: boolean }>;
}

export interface GateBrief {
  /** The Arabic text the image is supposed to render. */
  intendedText: string;
}

export interface RunImageGateOptions {
  generator: GateImageGenerator;
  verifier: GateVisionVerifier;
  briefs: GateBrief[];
  /** Number of generations to run for the gate. Defaults to 20 (doc 16). */
  n?: number;
}

export interface ImageGateReport {
  total: number;
  broken: number;
  breakageRate: number;
  decision: GateDecision;
  samples: GateSample[];
}

export const DEFAULT_GATE_SIZE = 20;

/**
 * Runs the gate over the first `n` briefs. For each brief: generate bytes,
 * verify, and record a `GateSample`. `broken` is re-derived from
 * `isArabicTextBroken(intended, verified)` rather than trusting the
 * verifier's self-reported `matches`, so a mis-reporting verifier cannot
 * skew the gate.
 */
export async function runImageGate(options: RunImageGateOptions): Promise<ImageGateReport> {
  const { generator, verifier, briefs } = options;
  const n = options.n ?? DEFAULT_GATE_SIZE;

  if (briefs.length < n) {
    throw new Error(
      `runImageGate requires at least ${n} briefs to run the gate; got ${briefs.length}.`,
    );
  }

  const samples: GateSample[] = [];
  for (const brief of briefs.slice(0, n)) {
    const bytes = await generator.generate(brief.intendedText);
    const { verifiedText } = await verifier.verify(bytes, brief.intendedText);
    samples.push({
      intendedText: brief.intendedText,
      verifiedText,
      broken: isArabicTextBroken(brief.intendedText, verifiedText),
    });
  }

  const breakageRate = computeBreakageRate(samples);
  return {
    total: samples.length,
    broken: samples.filter((s) => s.broken).length,
    breakageRate,
    decision: decideMethod(breakageRate),
    samples,
  };
}

/**
 * Thin CLI entry. Guarded so importing this module never runs anything.
 * Wiring real OpenAI-backed generator/verifier instances is intentionally
 * left to the manual harness (it needs ConfigService + API keys); this
 * block only documents the shape and prints a hint when run directly.
 */
if (require.main === module) {
  // eslint-disable-next-line no-console
  console.error(
    'runImageGate is a library function. Wire a real GateImageGenerator + ' +
      'GateVisionVerifier (OpenAiImageClient + VisionVerifier) and call it from ' +
      'a manual script. See docs/decisions/image-gate.md.',
  );
  process.exitCode = 1;
}
