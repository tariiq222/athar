import { BRAND_ANALYZE_CONFIG, DEFAULT_BRAND_KIT } from './brand.config';

describe('brand.config', () => {
  it('caps fetches and summarize retries', () => {
    expect(BRAND_ANALYZE_CONFIG.maxFetches).toBe(6);
    expect(BRAND_ANALYZE_CONFIG.maxSummarizeRetries).toBe(2);
  });
  it('defaults the brand kit font to IBM Plex Sans Arabic', () => {
    expect(DEFAULT_BRAND_KIT.font).toBe('IBM Plex Sans Arabic');
    expect(DEFAULT_BRAND_KIT.colors).toEqual([]);
  });
});