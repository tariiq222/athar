// One source of truth for analyze cost caps and brand-kit defaults (Global Constraint: cost cap).
export const BRAND_ANALYZE_CONFIG = {
  maxFetches: 6, // website + up to N account profiles per analyze
  maxSummarizeRetries: 2, // limited retries before falling back to a minimal draft
};

export const DEFAULT_BRAND_KIT = {
  visualStyle: '',
  font: 'IBM Plex Sans Arabic',
  colors: [] as string[],
};