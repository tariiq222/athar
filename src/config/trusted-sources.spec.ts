import { isTrustedDomain, deriveTenantTrustedSources, TRUSTED_DOMAINS } from './trusted-sources';

describe('trusted-sources', () => {
  it('contains the locked Saudi/global trusted-domain baseline', () => {
    expect(TRUSTED_DOMAINS).toEqual(
      expect.arrayContaining([
        'argaam.com',
        'alriyadh.com',
        'aleqtisadiah.com',
        'saudigazette.com',
        'arabnews.com',
        'reuters.com',
        'apnews.com',
      ]),
    );
  });

  it('matches trusted domains with or without www', () => {
    expect(isTrustedDomain('https://www.argaam.com/article/123')).toBe(true);
    expect(isTrustedDomain('https://argaam.com/article/123')).toBe(true);
    expect(isTrustedDomain('https://argaam.com.evil.tld/article')).toBe(false);
  });

  it('rejects unknown domains', () => {
    expect(isTrustedDomain('https://random-blog.example/post')).toBe(false);
  });

  it('rejects malformed urls safely', () => {
    expect(isTrustedDomain('not a url')).toBe(false);
    expect(isTrustedDomain('')).toBe(false);
  });

  it('derives tenant sources from brand.topics (each topic as a search-domain hint, not a domain whitelist)', () => {
    const derived = deriveTenantTrustedSources(['saudi-vision-2030', 'humain', 'gcc-retail']);
    // Per doc 16: per-tenant sources are derived from topics but the global
    // whitelist is the actual access control; this returns hint keywords.
    expect(derived).toContain('saudi-vision-2030');
    expect(derived).toContain('humain');
  });

  it('deduplicates and lower-cases', () => {
    const derived = deriveTenantTrustedSources(['SaudIAI', 'saudiai', 'Humain']);
    expect(new Set(derived).size).toBe(derived.length);
    expect(derived.every((s) => s === s.toLowerCase())).toBe(true);
  });
});