/**
 * Trusted sources — the global whitelist of domains whose content is allowed
 * to feed the engine's fact extraction.
 *
 * Per doc 16 (engine architecture) + doc 14 (locked decisions):
 *   "Live search is restricted to a trusted-sources whitelist. ... The whitelist
 *    is owned and maintained by this phase (config, updatable without a code deploy)."
 *
 * This module is the ONLY place the global whitelist lives. Per-tenant topics
 * are passed separately to the search provider as query-time hints; the global
 * whitelist remains the authoritative access control on what URLs the engine
 * may fetch.
 *
 * To update the whitelist:
 *   1. Edit TRUSTED_DOMAINS below.
 *   2. Open a PR with rationale (data-quality, new authoritative source, etc.)
 *   3. No migration / no deploy of engine logic needed.
 */

import type { BrandProfileInput } from '../engine/types';

export const TRUSTED_DOMAINS: readonly string[] = [
  // Saudi Arabia — mainstream business / news
  'argaam.com',
  'alriyadh.com',
  'aleqtisadiah.com',
  'saudigazette.com',
  'arabnews.com',
  'aawsat.com',
  // Global wire services
  'reuters.com',
  'apnews.com',
  'bloomberg.com',
] as const;

/**
 * Hostname extraction that is robust to:
 *   - missing scheme (https://argaam.com or argaam.com)
 *   - leading www.
 *   - malformed input (returns null, never throws)
 */
export function extractHostname(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The access-control predicate. Returns true iff the URL's hostname is
 * in TRUSTED_DOMAINS. Uses an exact-match on the bare hostname (after
 * stripping www.) so attacker-controlled subdomains like
 *   argaam.com.evil.tld
 * cannot pass.
 */
export function isTrustedDomain(url: string): boolean {
  const host = extractHostname(url);
  if (!host) return false;
  return (TRUSTED_DOMAINS as readonly string[]).includes(host);
}

/**
 * Per-call domain check against a passed-in whitelist. Used by the search
 * fetcher so the caller (LiveSearchProvider) controls which list applies
 * (global TRUSTED_DOMAINS, per-tenant derivation, or an intersection).
 *
 * Allows exact match AND any subdomain (e.g. `www.reuters.com`,
 * `sub.reuters.com` both pass for `reuters.com`). Look-alikes
 * (`reuters.com.evil.com`) are rejected because they don't share a
 * boundary at a `.`.
 */
export function isDomainAllowed(url: string, whitelist: readonly string[]): boolean {
  const host = extractHostname(url);
  if (!host) return false;
  return whitelist.some((d) => {
    const norm = d.toLowerCase();
    return host === norm || host.endsWith(`.${norm}`);
  });
}

/**
 * Plan-spec export name. Mirrors TRUSTED_DOMAINS so existing call sites
 * keep working; new code should import GLOBAL_TRUSTED_DOMAINS.
 */
export const GLOBAL_TRUSTED_DOMAINS: readonly string[] = TRUSTED_DOMAINS;

/**
 * A topic entry that is itself a bare domain (e.g. `reuters.com`)
 * becomes a tenant-specific trusted domain. Free-text topics
 * (e.g. `fintech`) do not add domains.
 */
export function tenantDomainsForTopics(topics: string[]): string[] {
  const domainLike = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  return topics
    .map((t) => t.trim().toLowerCase())
    .filter((t) => domainLike.test(t));
}

/**
 * Build the effective whitelist for a brand: global trusted domains,
 * plus any extras from `ENGINE_TRUSTED_DOMAINS_EXTRA` (comma-separated),
 * plus domain-shaped topics from the brand. Deduped, no deploy needed
 * to add a new global source — edit `TRUSTED_DOMAINS` (or set the env var).
 */
export function buildWhitelist(brand: BrandProfileInput): string[] {
  const extra = (process.env.ENGINE_TRUSTED_DOMAINS_EXTRA ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const all = [
    ...(GLOBAL_TRUSTED_DOMAINS as readonly string[]),
    ...extra,
    ...tenantDomainsForTopics(brand.topics),
  ];
  return Array.from(new Set(all));
}

/**
 * Per-tenant derivation. The engine uses this to scope search queries to
 * the customer's topics. It is NOT a domain whitelist — only the global
 * list above controls which URLs are fetchable.
 */
export function deriveTenantTrustedSources(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of topics) {
    const norm = t.trim().toLowerCase();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}