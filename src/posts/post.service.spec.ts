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

// ── PostService.list ──────────────────────────────────────────────────────────

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

  it('defaults page to 1 when page <= 0 is supplied', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { page: 0 });
    expect(res.page).toBe(1);
  });

  it('defaults pageSize to 20 when pageSize <= 0 is supplied', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { pageSize: 0 });
    expect(res.pageSize).toBe(20);
  });

  it('applies a from-only date filter (no upper bound)', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.list(tenantId, { from: '2026-10-01' });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledAt: { gte: new Date('2026-10-01') },
        }),
      }),
    );
    // lte key must NOT be present when only from is given
    const callArg = prisma.post.findMany.mock.calls[0][0] as any;
    expect(callArg.where.scheduledAt.lte).toBeUndefined();
  });

  it('applies a to-only date filter (no lower bound)', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.list(tenantId, { to: '2026-10-31' });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledAt: { lte: new Date('2026-10-31') },
        }),
      }),
    );
    const callArg = prisma.post.findMany.mock.calls[0][0] as any;
    expect(callArg.where.scheduledAt.gte).toBeUndefined();
  });

  it('omits scheduledAt filter when neither from nor to is provided', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.list(tenantId, {});

    const callArg = prisma.post.findMany.mock.calls[0][0] as any;
    expect(callArg.where.scheduledAt).toBeUndefined();
  });

  it('omits status filter from where when not supplied', async () => {
    const prisma = makePrisma([], 0);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.list(tenantId, {});

    const callArg = prisma.post.findMany.mock.calls[0][0] as any;
    expect(callArg.where.status).toBeUndefined();
  });

  it('maps null scheduledAt to null in PostListItem', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'p2',
          platform: 'linkedin',
          status: 'draft',
          scheduledAt: null,
          text: 'hi',
          hashtags: [],
          image: null,
          _count: { citations: 0 },
        },
      ],
      1,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, {});
    expect(res.items[0].scheduledAt).toBeNull();
  });

  it('maps hasImage=false when row.image is null', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'p3',
          platform: 'x',
          status: 'draft',
          scheduledAt: null,
          text: 'x',
          hashtags: [],
          image: null,
          _count: { citations: 0 },
        },
      ],
      1,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, {});
    expect(res.items[0].hasImage).toBe(false);
  });

  it('maps citationCount=0 when _count is absent on the row', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'p4',
          platform: 'x',
          status: 'draft',
          scheduledAt: null,
          text: 'x',
          hashtags: [],
          image: null,
          // no _count property
        },
      ],
      1,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, {});
    expect(res.items[0].citationCount).toBe(0);
  });

  it('computes correct skip offset for page > 1', async () => {
    const prisma = makePrisma([], 5);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.list(tenantId, { page: 3, pageSize: 10 });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('includes total from count call even when rows are empty', async () => {
    const prisma = makePrisma([], 42);
    const moduleRef = await Test.createTestingModule({
      providers: [PostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.list(tenantId, { page: 5, pageSize: 10 });
    expect(res.total).toBe(42);
    expect(res.items).toEqual([]);
  });
});

// ── PostService.patch ─────────────────────────────────────────────────────────

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

  // ── not-found / tenant isolation ──────────────────────────────────────────

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

  it('does not call tx.post.update when the post is not found', async () => {
    const tx = makeTxMock({ existing: null });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(svc.patch('t1', 'p1', { text: 'x' })).rejects.toBeDefined();
    expect(tx.post.update).not.toHaveBeenCalled();
  });

  it('scopes post lookup to the provided tenantId', async () => {
    const tx = makeTxMock({ existing: null });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(svc.patch('t-other', 'p1', {})).rejects.toBeDefined();
    expect(tx.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', tenantId: 't-other' } }),
    );
  });

  // ── state transition — invalid ────────────────────────────────────────────

  it('rejects transition whose from does not match current status with INVALID_TRANSITION (409)', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'draft',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    };
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

  it('rejects any transition.to === "published" with PUBLISH_NOT_ALLOWED_HERE (only Phase 5 publishes)', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'approved',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(
      svc.patch('t1', 'p1', { transition: { from: 'approved', to: 'published' } }),
    ).rejects.toMatchObject({ code: 'PUBLISH_NOT_ALLOWED_HERE' });
    expect(tx.post.update).not.toHaveBeenCalled();
  });

  it('rejects draft → approved (undefined transition) as INVALID_TRANSITION', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'draft',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(
      svc.patch('t1', 'p1', { transition: { from: 'draft', to: 'approved' } }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  // ── CONTENT_LOCKED ────────────────────────────────────────────────────────

  it('rejects content edit on an approved post with CONTENT_LOCKED (409)', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'approved',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(svc.patch('t1', 'p1', { text: 'changed' })).rejects.toMatchObject({
      code: 'CONTENT_LOCKED',
    });
  });

  it('rejects hashtag edit on approved post with CONTENT_LOCKED', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'approved',
      text: 'x',
      hashtags: ['#a'],
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(svc.patch('t1', 'p1', { hashtags: ['#b'] })).rejects.toMatchObject({
      code: 'CONTENT_LOCKED',
    });
  });

  it('rejects image edit on approved post with CONTENT_LOCKED', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'approved',
      text: 'x',
      hashtags: [],
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(
      svc.patch('t1', 'p1', { image: { url: 'https://cdn/x.png', method: 'gpt-image' } }),
    ).rejects.toMatchObject({ code: 'CONTENT_LOCKED' });
  });

  it('rejects image_null=true on approved post with CONTENT_LOCKED', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      status: 'approved',
      text: 'x',
      hashtags: [],
      image: { url: 'u', method: 'm' },
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await expect(svc.patch('t1', 'p1', { image_null: true })).rejects.toMatchObject({
      code: 'CONTENT_LOCKED',
    });
  });

  it('allows scheduledAt change on approved post (not a content edit)', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'approved',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    // Must NOT throw CONTENT_LOCKED
    await expect(
      svc.patch('t1', 'p1', { scheduledAt: '2026-10-01T10:00:00Z' }),
    ).resolves.toBeDefined();
  });

  // ── allowed state transitions ──────────────────────────────────────────────

  it('applies an allowed transition (draft → pending_review) and updates the status', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const final = { ...existing, status: 'pending_review' };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', {
      transition: { from: 'draft', to: 'pending_review' },
    });
    expect(res.status).toBe('pending_review');
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ status: 'pending_review' }),
      }),
    );
  });

  it('applies pending_review → approved transition', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'pending_review',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const final = { ...existing, status: 'approved' };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', {
      transition: { from: 'pending_review', to: 'approved' },
    });
    expect(res.status).toBe('approved');
  });

  it('applies approved → pending_review pull-back transition', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'approved',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const final = { ...existing, status: 'pending_review' };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', {
      transition: { from: 'approved', to: 'pending_review' },
    });
    expect(res.status).toBe('pending_review');
  });

  it('applies pending_review → draft reopen transition', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'pending_review',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const final = { ...existing, status: 'draft' };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', {
      transition: { from: 'pending_review', to: 'draft' },
    });
    expect(res.status).toBe('draft');
  });

  // ── content edits ──────────────────────────────────────────────────────────

  it('updates text on a draft post', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'old',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: { ...existing, text: 'new text' } });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { text: 'new text' });
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: 'new text' }),
      }),
    );
  });

  it('updates hashtags on a draft post', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: ['#old'],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: { ...existing, hashtags: ['#new'] } });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { hashtags: ['#new'] });
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hashtags: ['#new'] }),
      }),
    );
  });

  it('sets scheduledAt on a draft post', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { scheduledAt: '2026-10-01T10:00:00Z' });
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduledAt: new Date('2026-10-01T10:00:00Z') }),
      }),
    );
  });

  it('clears scheduledAt when scheduledAt_null=true', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: new Date('2026-10-01'),
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: { ...existing, scheduledAt: null } });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { scheduledAt_null: true });
    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduledAt: null }),
      }),
    );
  });

  it('allows text edit on pending_review post (not locked)', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'pending_review',
      text: 'old',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: { ...existing, text: 'edited' } });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    // Should NOT throw CONTENT_LOCKED
    await expect(svc.patch('t1', 'p1', { text: 'edited' })).resolves.toBeDefined();
  });

  // ── image upsert / delete ─────────────────────────────────────────────────

  it('upserts the image when dto.image is provided', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
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
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: { url: 'u', method: 'm' },
      citations: [],
    };
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

  it('does not call imageAsset.upsert or deleteMany when neither image nor image_null is set', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    await svc.patch('t1', 'p1', { text: 'hello' });
    expect(tx.imageAsset.upsert).not.toHaveBeenCalled();
    expect(tx.imageAsset.deleteMany).not.toHaveBeenCalled();
  });

  // ── final re-read and PostDetail mapping ──────────────────────────────────

  it('returns the final state from the re-read post including image and citations', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const final = {
      ...existing,
      text: 'updated',
      image: { url: 'https://cdn/pic.jpg', method: 'gpt-image' },
      citations: [{ claim: 'fact', sourceUrl: 'https://example.com' }],
    };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', { text: 'updated' });
    expect(res.image).toEqual({ url: 'https://cdn/pic.jpg', method: 'gpt-image' });
    expect(res.citations).toEqual([{ claim: 'fact', sourceUrl: 'https://example.com' }]);
  });

  it('maps scheduledAt ISO string when present in the final post', async () => {
    const scheduledDate = new Date('2026-10-15T08:00:00.000Z');
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const final = { ...existing, scheduledAt: scheduledDate };
    const tx = makeTxMock({ existing, final });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', { scheduledAt: '2026-10-15T08:00:00Z' });
    expect(res.scheduledAt).toBe('2026-10-15T08:00:00.000Z');
  });

  it('maps null image to null in the returned PostDetail', async () => {
    const existing = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'x',
      hashtags: [],
      scheduledAt: null,
      createdAt: new Date('2026-09-23'),
      image: null,
      citations: [],
    };
    const tx = makeTxMock({ existing, final: existing });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PrismaService, useValue: { $transaction: (cb: any) => cb(tx) } },
      ],
    }).compile();
    const svc = moduleRef.get(PostService);

    const res = await svc.patch('t1', 'p1', { text: 'x' });
    expect(res.image).toBeNull();
  });
});
