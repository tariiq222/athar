import { OpenAiImageClient } from './openai-image.client';
import { EngineError } from '../../types';

const generate = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    images: { generate: (...a: unknown[]) => generate(...a) },
  })),
);

const config = {
  get: (k: string) => ({ OPENAI_API_KEY: 'k', OPENAI_IMAGE_MODEL: 'img-model' })[k],
} as any;

describe('OpenAiImageClient', () => {
  beforeEach(() => generate.mockReset());

  it('returns image bytes from base64', async () => {
    generate.mockResolvedValue({
      data: [{ b64_json: Buffer.from('png').toString('base64') }],
    });
    const c = new OpenAiImageClient(config);
    const buf = await c.generate('prompt', '1200x1200');
    expect(buf.toString()).toBe('png');
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'img-model', size: '1200x1200' }),
    );
  });

  it('wraps failures as provider_error', async () => {
    generate.mockRejectedValue(new Error('429'));
    const c = new OpenAiImageClient(config);
    await expect(c.generate('p', '1200x1200')).rejects.toBeInstanceOf(EngineError);
  });
});
