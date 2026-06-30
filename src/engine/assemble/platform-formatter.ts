import twitter from 'twitter-text';
import type { Draft } from '../types';
import type { Platform } from '../../config/platform-limits';
import { getLimit } from '../../config/platform-limits';

export interface FormatResult {
  fits: boolean;
  weightedLength: number;
  hashtags: string[];
  overBy: number;
}

/**
 * Stage 5 part A — validates and shapes the draft against platform limits
 * (doc 15). X uses twitter-text weighted counting; LinkedIn uses raw char
 * length. Hashtags are clamped to the platform's max (excess dropped);
 * never silently truncates body text — over-limit body signals the
 * assemble stage to re-draft with a tighter constraint.
 */
export function formatForPlatform(draft: Draft, platform: Platform): FormatResult {
  const limit = getLimit(platform);

  const weightedLength =
    platform === 'x' ? twitter.parseTweet(draft.text).weightedLength : draft.text.length;

  const cap = limit.maxChars;
  const overBy = Math.max(0, weightedLength - cap);
  const hashtags = draft.hashtags.slice(0, limit.hashtags.max);

  return { fits: overBy === 0, weightedLength, hashtags, overBy };
}
