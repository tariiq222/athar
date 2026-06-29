import { VisionVerifier } from './vision-verifier';

const create = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...a: unknown[]) => create(...a) } },
  })),
);

const config = {
  get: (k: string) => ({ OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'vision' }[k]),
} as any;

describe('VisionVerifier', () => {
  beforeEach(() => create.mockReset());

  it('matches when the read-back text equals intended', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ابدأ الآن' } }] });
    const v = new VisionVerifier(config);
    expect(await v.verify(Buffer.from('x'), 'ابدأ الآن')).toEqual({
      verifiedText: 'ابدأ الآن',
      matches: true,
    });
  });

  it('does not match when text is broken', async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: 'اىدأ الان zz' } }],
    });
    const v = new VisionVerifier(config);
    const r = await v.verify(Buffer.from('x'), 'ابدأ الآن');
    expect(r.matches).toBe(false);
  });
});