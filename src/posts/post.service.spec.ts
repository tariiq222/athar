import { Test } from '@nestjs/testing';
import { PostService } from './post.service';
import { PrismaService } from '../prisma/prisma.service';

const tenantId = 't1';

function makePrisma(rows: any[], total: number) {
  return {
    post: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(total),
    },
  };
}

describe('PostService.list', () => {
  it('scopes by tenantId, maps rows to PostListItem, returns pagination meta', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'p1',
          platform: 'x',
          status: 'draft',
          scheduledAt: new Date('2026-09-23T09:00:00.000Z'),
          text: 'hello world',
          hashtags: ['#a'],
          image: { id: 'img1' },
          _count: { citations: 2 },
        },
      ],
      1,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { status: 'draft', page: 1, pageSize: 20 });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId, status: 'draft' }),
      }),
    );
    expect(res).toEqual({
      items: [
        {
          id: 'p1',
          platform: 'x',
          status: 'draft',
          scheduledAt: '2026-09-23T09:00:00.000Z',
          text: 'hello world',
          hashtags: ['#a'],
          hasImage: true,
          citationCount: 2,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('clamps pageSize to 100 and defaults page/pageSize', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { pageSize: 500 });

    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(100);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, skip: 0 }),
    );
  });

  it('passes platform and date-range filters through to Prisma', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.list(tenantId, {
      platform: 'linkedin',
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          platform: 'linkedin',
          scheduledAt: expect.objectContaining({
            gte: new Date('2026-09-01'),
            lte: new Date('2026-09-30'),
          }),
        }),
      }),
    );
  });
});

describe('PostService.patch', () => {
  function makeTxMock(opts: { existing: any | null; updated?: any; final?: any }) {
    const tx = {
      post: {
        findFirst: jest.fn().mockResolvedValue(opts.existing),
        update: jest.fn().mockResolvedValue(opts.updated ?? opts.existing),
        findFirstOrThrow: jest.fn().mockResolvedValue(opts.final ?? opts.existing),
      },
      imageAsset: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return tx;
  }

  it('returns NOT_FOUND (404) when the post does not belong to the tenant', async () => {
    const tx = makeTxMock({ existing: null });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(svc.patch('t1', 'p1', { text: 'new' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects transition whose from does not match current status with INVALID_TRANSITION (409)', async () => {
    const existing = { id: 'p1', tenantId: 't1', status: 'draft', text: 'x', hashtags: [], image: null, citations: [] };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(
      svc.patch('t1', 'p1', { transition: { from: 'pending_review', to: 'approved' } }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('rejects content edit on an approved post with CONTENT_LOCKED (409)', async () => {
    const existing = { id: 'p1', tenantId: 't1', status: 'approved', text: 'x', hashtags: [], image: null, citations: [] };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(
      svc.patch('t1', 'p1', { text: 'changed' }),
    ).rejects.toMatchObject({ code: 'CONTENT_LOCKED' });
  });

  it('applies an allowed transition (draft → pending_review) and updates the status', async () => {
    const existing = { id: 'p1', tenantId: 't1', brandProfileId: 'b1', platform: 'x', status: 'draft', text: 'x', hashtags: [], scheduledAt: null, createdAt: new Date('2026-09-23'), image: null, citations: [] };
    const final = { ...existing, status: 'pending_review' };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', { transition: { from: 'draft', to: 'pending_review' } });
    expect(res.status).toBe('pending_review');
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ status: 'pending_review' }),
      }),
    );
  });

  it('upserts the image when dto.image is provided', async () => {
    const existing = { id: 'p1', tenantId: 't1', brandProfileId: 'b1', platform: 'x', status: 'draft', text: 'x', hashtags: [], scheduledAt: null, createdAt: new Date('2026-09-23'), image: null, citations: [] };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { image: { url: 'https://cdn/x.png', method: 'gpt-image' } });
    expect(tx.imageAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: 'p1' },
        create: expect.objectContaining({ url: 'https://cdn/x.png', method: 'gpt-image' }),
      }),
    );
  });

  it('deletes the image when image_null is true', async () => {
    const existing = { id: 'p1', tenantId: 't1', brandProfileId: 'b1', platform: 'x', status: 'draft', text: 'x', hashtags: [], scheduledAt: null, createdAt: new Date('2026-09-23'), image: { url: 'u', method: 'm' }, citations: [] };
    const tx = makeTxMock({ existing, final: { ...existing, image: null } });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { image_null: true });
    expect(tx.imageAsset.deleteMany).toHaveBeenCalledWith({ where: { postId: 'p1' } });
  });
});
