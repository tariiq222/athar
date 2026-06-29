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
