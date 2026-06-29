import { AssembleStage, PlatformLimitExceeded } from './assemble.stage';
import type { Draft, ImageAsset } from '../types';

const draft: Draft = {
  text: 'مرحبا',
  citations: [{ claim: 'c', sourceUrl: 'https://reuters.com/x' }],
  hashtags: ['#a', '#b', '#c'],
  imageBrief: '',
};
const image: ImageAsset = {
  url: 'http://minio/p.png',
  verifiedText: 'مرحبا',
  method: 'gpt-image',
  attempts: 1,
};

describe('AssembleStage', () => {
  it('persists a pending_review post with citations and image', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'post-1' });
    const prisma = { post: { create } } as any;
    const stage = new AssembleStage(prisma);
    const id = await stage.run({
      tenantId: 'tn',
      brandProfileId: 'bp',
      draft,
      image,
      platform: 'linkedin',
      quotaStatus: 'ok',
    });
    expect(id).toBe('post-1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tn',
          brandProfileId: 'bp',
          platform: 'linkedin',
          status: 'pending_review',
          quotaStatus: 'ok',
          text: 'مرحبا',
          originalText: 'مرحبا',
          hashtags: ['#a', '#b', '#c'],
          citations: {
            create: [{ claim: 'c', sourceUrl: 'https://reuters.com/x' }],
          },
          image: {
            create: {
              url: 'http://minio/p.png',
              method: 'gpt-image',
              verifiedText: 'مرحبا',
              attempts: 1,
            },
          },
        }),
      }),
    );
  });

  it('persists without image when image is null', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'post-2' });
    const prisma = { post: { create } } as any;
    const stage = new AssembleStage(prisma);
    await stage.run({
      tenantId: 'tn',
      brandProfileId: 'bp',
      draft,
      image: null,
      platform: 'linkedin',
      quotaStatus: 'ok',
    });
    const arg = create.mock.calls[0][0];
    expect(arg.data.image).toBeUndefined();
  });

  it('throws PlatformLimitExceeded when text is over the limit', async () => {
    const prisma = { post: { create: jest.fn() } } as any;
    const stage = new AssembleStage(prisma);
    const long: Draft = { ...draft, text: 'x'.repeat(3001) };
    await expect(
      stage.run({
        tenantId: 'tn',
        brandProfileId: 'bp',
        draft: long,
        image,
        platform: 'linkedin',
        quotaStatus: 'ok',
      }),
    ).rejects.toBeInstanceOf(PlatformLimitExceeded);
    expect(prisma.post.create).not.toHaveBeenCalled();
  });
});