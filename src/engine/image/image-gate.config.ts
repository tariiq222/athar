import type { GateDecision } from './image-gate';

/**
 * IMAGE_GATE_DECISION — the committed default for image-stage behavior.
 *
 * This is the *initial* decision before the 20-image gate has been run on
 * a real product image set. It deliberately chooses the SAFER path
 * (overlay as primary) so we never ship broken Arabic text:
 *
 *   - gpt-image with 0 attempts means "do not try gpt-image first"
 *   - overlay becomes the primary; gpt-image still available as upgrade
 *     once the gate is actually run.
 *
 * After running `npm run image:gate` against real images and updating
 * this constant per the documented procedure (docs/decisions/image-gate.md),
 * downstream stages (Task 16) read this to decide primaryMethod.
 */
export const IMAGE_GATE_DECISION: GateDecision = {
  primaryMethod: 'overlay',
  gptImageMaxAttempts: 0,
};