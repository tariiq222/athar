import { formatForPlatform } from './platform-formatter';
import type { Draft } from '../types';

const make = (text: string, hashtags: string[]): Draft => ({
  text,
  citations: [],
  hashtags,
  imageBrief: '',
});

describe('formatForPlatform', () => {
  it('linkedin: fits under 3000 and clamps to max 5 hashtags', () => {
    const r = formatForPlatform(
      make('مرحبا', ['#a', '#b', '#c', '#d', '#e', '#f']),
      'linkedin',
    );
    expect(r.fits).toBe(true);
    expect(r.weightedLength).toBe('مرحبا'.length);
    expect(r.hashtags).toHaveLength(5);
    expect(r.overBy).toBe(0);
  });

  it('linkedin: over 3000 chars reports not fitting and overBy', () => {
    const long = 'x'.repeat(3010);
    const r = formatForPlatform(make(long, []), 'linkedin');
    expect(r.fits).toBe(false);
    expect(r.overBy).toBe(10);
  });

  it('x: uses twitter-text weighted length and 280 cap', () => {
    const r = formatForPlatform(make('hello world', ['#a', '#b', '#c']), 'x');
    expect(r.weightedLength).toBeGreaterThan(0);
    expect(r.fits).toBe(true);
    expect(r.hashtags).toHaveLength(2); // X max 2
  });

  it('x: a > 280 weighted post does not fit', () => {
    const r = formatForPlatform(make('a'.repeat(300), []), 'x');
    expect(r.fits).toBe(false);
    expect(r.overBy).toBe(20);
  });
});