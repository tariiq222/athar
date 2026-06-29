import { MarkPublishedService } from './mark-published.service';

function setup(post: any, scheduled: any[] = []) {
  const prisma = {
    post: {
      findFirst: jest.fn().mockResolvedValue(post),
      update: jest.fn(async ({ data }: any) => ({ ...post, ...data })),
    },
    reminder: {
      findMany: jest.fn().mockResolvedValue(scheduled),
      updateMany: jest.fn().mockResolvedValue({ count: scheduled.length }),
    },
  } as any;
  const queue = { remove: jest.fn() } as any;
  return { prisma, queue, svc: new MarkPublishedService(prisma, queue) };
}

describe('MarkPublishedService', () => {
  it('moves approved -> published and returns the result', async () => {
    const { svc } = setup({ id: 'p1', tenantId: 't1', status: 'approved' });
    const res = await svc.markPublished('t1', 'p1');
    expect(res.postId).toBe('p1');
    expect(res.status).toBe('published');
    expect(typeof res.publishedAt).toBe('string');
  });

  it('honors an explicit publishedAt', async () => {
    const { svc } = setup({ id: 'p1', tenantId: 't1', status: 'approved' });
    const when = '2026-06-30T12:00:00.000Z';
    const res = await svc.markPublished('t1', 'p1', when);
    expect(res.publishedAt).toBe(when);
  });

  it('cancels pending scheduled reminders and removes their jobs', async () => {
    const { svc, prisma, queue } = setup({ id: 'p1', tenantId: 't1', status: 'approved' }, [
      { id: 'r1' },
      { id: 'r2' },
    ]);
    await svc.markPublished('t1', 'p1');
    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { postId: 'p1', tenantId: 't1', status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    expect(queue.remove).toHaveBeenCalledWith('r1');
    expect(queue.remove).toHaveBeenCalledWith('r2');
  });

  it('throws INVALID_STATUS_TRANSITION for a non-approved post', async () => {
    const { svc } = setup({ id: 'p1', tenantId: 't1', status: 'draft' });
    try {
      await svc.markPublished('t1', 'p1');
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('INVALID_STATUS_TRANSITION');
      expect(e.getStatus?.()).toBe(409);
    }
  });

  it('throws NOT_FOUND for a missing or cross-tenant post', async () => {
    const { svc } = setup(null);
    try {
      await svc.markPublished('t1', 'nope');
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('NOT_FOUND');
      expect(e.getStatus?.()).toBe(404);
    }
  });
});
