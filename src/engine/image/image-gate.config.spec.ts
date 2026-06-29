import { IMAGE_GATE_DECISION } from './image-gate.config';

describe('IMAGE_GATE_DECISION', () => {
  it('is a valid GateDecision shape', () => {
    expect(['gpt-image', 'overlay']).toContain(IMAGE_GATE_DECISION.primaryMethod);
    expect(IMAGE_GATE_DECISION.gptImageMaxAttempts).toBeGreaterThanOrEqual(0);
  });

  it('starts in the safe overlay default (gate not yet run)', () => {
    // Until the 20-image gate is run on real product images, we default
    // to overlay to guarantee no broken Arabic ships.
    expect(IMAGE_GATE_DECISION).toEqual({
      primaryMethod: 'overlay',
      gptImageMaxAttempts: 0,
    });
  });
});