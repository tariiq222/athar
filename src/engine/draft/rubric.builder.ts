import type { Rubric, BrandProfileInput } from '../types';
import type { Platform } from '../../config/platform-limits';

/**
 * Encodes the required passing outcome for each critique dimension.
 * brand + platform are consumed by the critique prompt (Task 10) to
 * make each check concrete — this builder only sets the targets.
 */
export function buildRubric(
  _brand: BrandProfileInput,
  _platform: Platform,
): Rubric {
  return {
    toneMatch: true,
    sourceIntegrity: true,
    platformCompliance: true,
    prohibitions: true,
    clarity: true,
  };
}