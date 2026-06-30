import { requireOpenRouterKey } from './openrouter';

describe('openrouter adapter', () => {
  const original = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = original;
  });

  it('returns the key when set to a real-looking value', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-abcdef1234567890';
    expect(requireOpenRouterKey()).toBe('sk-or-v1-abcdef1234567890');
  });

  it('throws when missing', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => requireOpenRouterKey()).toThrow(/OPENROUTER_API_KEY/);
  });

  it('throws when still the placeholder', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-replace-me';
    expect(() => requireOpenRouterKey()).toThrow(/placeholder/);
  });
});
