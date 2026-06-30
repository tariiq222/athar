import { VisionVerifier } from './vision-verifier';
import { TenantContextService } from '../../../common/tenant-context.service';

const create = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...a: unknown[]) => create(...a) } },
  })),
);

const config = {
  get: (k: string) => ({ OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'vision' }[k]),
} as any;

function makeVerifier(usage: any = { record: jest.fn().mockResolvedValue(undefined) }) {
  return new VisionVerifier(config, usage, new TenantContextService());
}

describe('VisionVerifier', () => {
  beforeEach(() => create.mockReset());

  it('matches when the read-back text equals intended', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'ابدأ الآن' } }],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    const usage = { record: jest.fn().mockResolvedValue(undefined) };
    const v = makeVerifier(usage);
    expect(await v.verify(Buffer.from('x'), 'ابدأ الآن')).toEqual({
      verifiedText: 'ابدأ الآن',
      matches: true,
    });
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image_verify', units: 110 }),
    );
  });

  it('does not match when text is broken', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'اىدأ الان zz' } }],
      usage: { prompt_tokens: 50, completion_tokens: 5 },
    });
    const usage = { record: jest.fn().mockResolvedValue(undefined) };
    const v = makeVerifier(usage);
    const r = await v.verify(Buffer.from('x'), 'ابدأ الآن');
    expect(r.matches).toBe(false);
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image_verify' }),
    );
  });

  it('records image_verify cost as gpt-4o-mini text cost', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    });
    const usage = { record: jest.fn().mockResolvedValue(undefined) };
    const v = makeVerifier(usage);
    await v.verify(Buffer.from('x'), 'ابدأ الآن');
    // 1000 * 0.00015/1k + 500 * 0.0006/1k = 0.00045
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'image_verify',
        costUsd: expect.closeTo(0.00045, 6),
      }),
    );
  });
});