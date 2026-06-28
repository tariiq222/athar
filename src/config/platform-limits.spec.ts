import { getLimit, PLATFORM_LIMITS } from './platform-limits';

describe('platform-limits', () => {
  it('linkedin post cap is 3000 and 3-5 hashtags', () => {
    const l = getLimit('linkedin');
    expect(l.maxChars).toBe(3000);
    expect(l.hashtags).toEqual({ min: 3, max: 5 });
  });
  it('x free cap is 280 with premium 25000 and 1-2 hashtags', () => {
    const x = getLimit('x');
    expect(x.maxChars).toBe(280);
    expect(x.premiumMaxChars).toBe(25000);
    expect(x.hashtags).toEqual({ min: 1, max: 2 });
  });
  it('exposes both platforms', () => {
    expect(Object.keys(PLATFORM_LIMITS).sort()).toEqual(['linkedin', 'x']);
  });
});