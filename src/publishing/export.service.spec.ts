import { ExportService } from './export.service';
import { ExportFormatter } from './export-formatter.service';
import { DeepLinkBuilder } from './deep-link-builder.service';

function makePrisma(post: any) {
  return { post: { findFirst: jest.fn().mockResolvedValue(post) } } as any;
}

describe('ExportService', () => {
  const formatter = new ExportFormatter();
  const linker = new DeepLinkBuilder();

  it('builds a payload for an approved post with image and citation link', async () => {
    const prisma = makePrisma({
      id: 'p1',
      tenantId: 't1',
      platform: 'linkedin',
      status: 'approved',
      text: 'Body',
      hashtags: ['#x', '#y', '#z'],
      image: { url: 'https://img/p1.png' },
      citations: [{ sourceUrl: 'https://src.example' }],
    });
    const svc = new ExportService(prisma, formatter, linker);
    const payload = await svc.buildPayload('t1', 'p1');
    expect(payload.postId).toBe('p1');
    expect(payload.platform).toBe('linkedin');
    expect(payload.imageUrl).toBe('https://img/p1.png');
    expect(payload.formattedText).toContain('Body');
    expect(payload.link).toEqual({ url: 'https://src.example', placement: 'in_body' });
    expect(payload.limitMax).toBe(3000);
    expect(payload.deepLink).toBe('https://www.linkedin.com/feed/?shareActive=true');
  });

  it('omits imageUrl when the post has no image (200, text-only)', async () => {
    const prisma = makePrisma({
      id: 'p2',
      tenantId: 't1',
      platform: 'x',
      status: 'approved',
      text: 'Tweet',
      hashtags: ['#a'],
      image: null,
      citations: [],
    });
    const svc = new ExportService(prisma, formatter, linker);
    const payload = await svc.buildPayload('t1', 'p2');
    expect(payload.imageUrl).toBeUndefined();
    expect(payload.link).toBeUndefined();
  });

  it('allows an explicit platform override', async () => {
    const prisma = makePrisma({
      id: 'p3',
      tenantId: 't1',
      platform: 'linkedin',
      status: 'approved',
      text: 'Body',
      hashtags: ['#a'],
      image: null,
      citations: [],
    });
    const svc = new ExportService(prisma, formatter, linker);
    const payload = await svc.buildPayload('t1', 'p3', 'x');
    expect(payload.platform).toBe('x');
    expect(payload.limitMax).toBe(280);
  });

  it('throws NOT_FOUND for a missing or cross-tenant post', async () => {
    const prisma = makePrisma(null);
    const svc = new ExportService(prisma, formatter, linker);
    await expect(svc.buildPayload('t1', 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_APPROVED for a non-approved post', async () => {
    const prisma = makePrisma({
      id: 'p4',
      tenantId: 't1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    });
    const svc = new ExportService(prisma, formatter, linker);
    await expect(svc.buildPayload('t1', 'p4')).rejects.toMatchObject({
      code: 'NOT_APPROVED',
    });
  });
});
