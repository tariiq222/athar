import { ClaudeClient } from './claude.client';
import { EngineError } from '../../types';

const createMock = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: (...a: unknown[]) => createMock(...a) },
  }));
});

const config = {
  get: (k: string) =>
    ({
      OPENROUTER_API_KEY: 'sk-or-v1-test',
      ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4',
    })[k],
} as any;

describe('ClaudeClient', () => {
  beforeEach(() => createMock.mockReset());

  it('returns text and token counts and points the SDK at OpenRouter', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
    const client = new ClaudeClient(config);
    const res = await client.complete({ system: 's', user: 'u' });
    expect(res).toEqual({ text: 'hello', inputTokens: 10, outputTokens: 4 });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic/claude-sonnet-4', system: 's' }),
    );
  });

  it('wraps SDK errors as provider_error EngineError', async () => {
    createMock.mockRejectedValue(new Error('503'));
    const client = new ClaudeClient(config);
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'provider_error',
    });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(EngineError);
  });
});
