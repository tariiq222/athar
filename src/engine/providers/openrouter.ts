/**
 * OpenRouter adapter.
 *
 * Both the Anthropic SDK and the OpenAI SDK support custom `baseURL` and accept
 * a bearer token. By pointing them at https://openrouter.ai/api/v1 we route
 * Claude, GPT-5-image, and Gemini-vision through ONE provider, ONE key, with
 * automatic failover across upstream providers.
 *
 * This module is the ONLY place that hard-codes the OpenRouter base URL.
 * All other modules read it from env via ConfigService and pass it in.
 */

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Headers OpenRouter recommends for ranking + identification.
 * Required by their terms for production traffic.
 */
export const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://athar.local',
  'X-Title': 'Athar',
} as const;

/**
 * Returns the OpenRouter API key, or throws a clear error.
 * Never logs the key.
 */
export function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.startsWith('sk-or-v1-replace-me')) {
    throw new Error(
      'OPENROUTER_API_KEY is missing or still the placeholder. ' +
        'Get a key from https://openrouter.ai/keys and put it in .env.',
    );
  }
  return key;
}