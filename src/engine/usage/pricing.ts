/**
 * Pricing table for the AI providers the engine uses.
 *
 * Units: USD per 1,000 tokens (text) or USD per image (image). Kept in
 * code so a single grep finds every model and so prices live next to the
 * UsageRecord they fund. Update both this table and the matching model
 * field on each provider when Anthropic / OpenAI change rates.
 *
 * Sources (as of 2026-06):
 *   - claude-3-5-sonnet: $3 / 1M input, $15 / 1M output
 *   - claude-3-5-haiku:  $0.80 / 1M input, $4 / 1M output
 *   - gpt-4o-mini:       $0.15 / 1M input, $0.60 / 1M output
 *   - gpt-image-1:       ~$0.04 per image (flat; w/h/quality ignored for now)
 */

export type Model =
  | 'claude-3-5-sonnet'
  | 'claude-3-5-haiku'
  | 'gpt-image-1'
  | 'gpt-4o-mini';

const PER_1K: Record<Model, { input: number; output: number }> = {
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku': { input: 0.0008, output: 0.004 },
  'gpt-image-1': { input: 0.04, output: 0.04 }, // flat per image
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

export function textCostUsd(
  model: Model,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PER_1K[model];
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

export function imageCostUsd(
  model: Model,
  _w: number,
  _h: number,
  attempts: number,
): number {
  return PER_1K[model].input * attempts;
}