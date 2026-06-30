import {
  runImageGate,
  type GateImageGenerator,
  type GateVisionVerifier,
  type GateBrief,
} from './image-gate.runner';

/**
 * Offline unit tests for the 20-image-gate runner. The runner is driven by
 * a mocked generator + verifier so NO network / OpenAI calls happen. We assert:
 *   - exactly N generations + N verifications are attempted
 *   - the breakage rate is broken/total (delegated to computeBreakageRate)
 *   - the decision flips at the <10% (gpt-image) / >=10% (overlay) boundary
 */

function makeGenerator(): { gen: GateImageGenerator; calls: string[] } {
  const calls: string[] = [];
  const gen: GateImageGenerator = {
    generate: async (brief: string) => {
      calls.push(brief);
      // Deterministic, non-empty fake bytes; never hits the network.
      return Buffer.from(`fake-image:${brief}`);
    },
  };
  return { gen, calls };
}

/**
 * Verifier whose "broken" outcome is controlled per brief by a lookup set.
 * `verify` echoes the intended text when clean, or a mangled string when broken,
 * so the runner's own isArabicTextBroken-based bookkeeping is exercised end to end.
 */
function makeVerifier(brokenBriefs: Set<string>): {
  verifier: GateVisionVerifier;
  calls: number;
} {
  let calls = 0;
  const verifier: GateVisionVerifier = {
    verify: async (_bytes: Buffer, intendedText: string) => {
      calls += 1;
      if (brokenBriefs.has(intendedText)) {
        return { verifiedText: `${intendedText} xx-mangled`, matches: false };
      }
      return { verifiedText: intendedText, matches: true };
    },
  };
  // Expose the live counter via a getter-backed object.
  return {
    verifier,
    get calls() {
      return calls;
    },
  } as { verifier: GateVisionVerifier; calls: number };
}

function briefs(n: number): GateBrief[] {
  return Array.from({ length: n }, (_, i) => ({
    intendedText: `نص عربي رقم ${i}`,
  }));
}

describe('runImageGate', () => {
  it('attempts exactly N generations and N verifications', async () => {
    const { gen, calls } = makeGenerator();
    const v = makeVerifier(new Set());
    const list = briefs(20);

    const report = await runImageGate({
      generator: gen,
      verifier: v.verifier,
      briefs: list,
      n: 20,
    });

    expect(calls).toHaveLength(20);
    expect(v.calls).toBe(20);
    expect(report.total).toBe(20);
    expect(report.samples).toHaveLength(20);
  });

  it('computes breakageRate as broken/total and surfaces broken count', async () => {
    const { gen } = makeGenerator();
    const list = briefs(20);
    // 5 of 20 broken -> 0.25
    const broken = new Set(list.slice(0, 5).map((b) => b.intendedText));
    const v = makeVerifier(broken);

    const report = await runImageGate({
      generator: gen,
      verifier: v.verifier,
      briefs: list,
      n: 20,
    });

    expect(report.broken).toBe(5);
    expect(report.breakageRate).toBeCloseTo(0.25, 5);
  });

  it('decides gpt-image just below the 10% boundary', async () => {
    const { gen } = makeGenerator();
    const list = briefs(20);
    // 1 of 20 broken -> 0.05 (< 0.1)
    const broken = new Set([list[0].intendedText]);
    const v = makeVerifier(broken);

    const report = await runImageGate({
      generator: gen,
      verifier: v.verifier,
      briefs: list,
      n: 20,
    });

    expect(report.breakageRate).toBeCloseTo(0.05, 5);
    expect(report.decision).toEqual({
      primaryMethod: 'gpt-image',
      gptImageMaxAttempts: 3,
    });
  });

  it('decides overlay exactly at the 10% boundary', async () => {
    const { gen } = makeGenerator();
    const list = briefs(20);
    // 2 of 20 broken -> 0.10 (>= 0.1)
    const broken = new Set(list.slice(0, 2).map((b) => b.intendedText));
    const v = makeVerifier(broken);

    const report = await runImageGate({
      generator: gen,
      verifier: v.verifier,
      briefs: list,
      n: 20,
    });

    expect(report.breakageRate).toBeCloseTo(0.1, 5);
    expect(report.decision).toEqual({
      primaryMethod: 'overlay',
      gptImageMaxAttempts: 0,
    });
  });

  it('decides overlay well above the boundary', async () => {
    const { gen } = makeGenerator();
    const list = briefs(20);
    const broken = new Set(list.slice(0, 10).map((b) => b.intendedText)); // 0.5
    const v = makeVerifier(broken);

    const report = await runImageGate({
      generator: gen,
      verifier: v.verifier,
      briefs: list,
      n: 20,
    });

    expect(report.breakageRate).toBeCloseTo(0.5, 5);
    expect(report.decision.primaryMethod).toBe('overlay');
  });

  it('defaults N to 20 and caps generations at the number of briefs available', async () => {
    const { gen, calls } = makeGenerator();
    const v = makeVerifier(new Set());
    const list = briefs(20);

    const report = await runImageGate({
      generator: gen,
      verifier: v.verifier,
      briefs: list,
    });

    expect(calls).toHaveLength(20);
    expect(report.total).toBe(20);
  });

  it('rejects when fewer briefs than the requested N', async () => {
    const { gen } = makeGenerator();
    const v = makeVerifier(new Set());

    await expect(
      runImageGate({
        generator: gen,
        verifier: v.verifier,
        briefs: briefs(3),
        n: 20,
      }),
    ).rejects.toThrow(/at least 20 briefs/i);
  });

  it('marks a sample broken when the verifier reports a mismatch even if it claims match=true', async () => {
    // Defense in depth: the runner re-derives `broken` from isArabicTextBroken,
    // not from the verifier's self-reported `matches` flag.
    const { gen } = makeGenerator();
    const list = briefs(20);
    const lyingVerifier: GateVisionVerifier = {
      verify: async (_bytes, intendedText) => ({
        // Text actually differs, but the verifier wrongly says matches=true.
        verifiedText: `${intendedText} totally-different`,
        matches: true,
      }),
    };

    const report = await runImageGate({
      generator: gen,
      verifier: lyingVerifier,
      briefs: list,
      n: 20,
    });

    expect(report.broken).toBe(20);
    expect(report.breakageRate).toBeCloseTo(1, 5);
    expect(report.decision.primaryMethod).toBe('overlay');
  });
});
