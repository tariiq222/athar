import { LearningService } from './learning.service';

function prismaMock(post: any) {
  // findFirstOrThrow now carries a { id, tenantId } predicate. The mock honors
  // the tenantId so a cross-tenant lookup throws (Prisma's behavior on no row),
  // proving the service rejects another tenant's post.
  return {
    post: {
      findFirstOrThrow: jest.fn().mockImplementation(({ where }: any) => {
        if (post && where.tenantId === post.tenantId && where.id === post.id) {
          return Promise.resolve(post);
        }
        return Promise.reject(new Error('No Post found'));
      }),
    },
    brandProfile: {
      findFirstOrThrow: jest.fn().mockImplementation(({ where }: any) => {
        if (post && where.tenantId === post.tenantId) {
          return Promise.resolve({ learnedPreferences: 'existing.' });
        }
        return Promise.reject(new Error('No BrandProfile found'));
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('LearningService', () => {
  it('summarizes the edit and appends to learnedPreferences', async () => {
    const prisma = prismaMock({
      id: 'p1',
      tenantId: 'tn',
      brandProfileId: 'bp',
      originalText: 'A',
      text: 'B',
    });
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: 'Prefers shorter sentences.',
        inputTokens: 5,
        outputTokens: 5,
      }),
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    await new LearningService(prisma, claude, usage).captureApproval('tn', 'p1');
    expect(prisma.post.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'p1', tenantId: 'tn' },
    });
    expect(prisma.brandProfile.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'bp', tenantId: 'tn' },
    });
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'bp' },
      data: { learnedPreferences: 'existing.\nPrefers shorter sentences.' },
    });
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tn', kind: 'text' }),
    );
  });

  it('rejects a post belonging to another tenant (no cross-tenant leak)', async () => {
    const prisma = prismaMock({
      id: 'p1',
      tenantId: 'owner-tenant',
      brandProfileId: 'bp',
      originalText: 'A',
      text: 'B',
    });
    const claude = { complete: jest.fn() } as any;
    const usage = { record: jest.fn() } as any;
    // Caller's tenant does NOT own p1 -> the scoped lookup must throw.
    await expect(
      new LearningService(prisma, claude, usage).captureApproval('attacker-tenant', 'p1'),
    ).rejects.toThrow();
    expect(claude.complete).not.toHaveBeenCalled();
    expect(prisma.brandProfile.update).not.toHaveBeenCalled();
  });

  it('does nothing when the text was not changed', async () => {
    const prisma = prismaMock({
      id: 'p1',
      tenantId: 'tn',
      brandProfileId: 'bp',
      originalText: 'same',
      text: 'same',
    });
    const claude = { complete: jest.fn() } as any;
    const usage = { record: jest.fn() } as any;
    await new LearningService(prisma, claude, usage).captureApproval('tn', 'p1');
    expect(claude.complete).not.toHaveBeenCalled();
    expect(prisma.brandProfile.update).not.toHaveBeenCalled();
  });

  it('does nothing when originalText is missing', async () => {
    const prisma = prismaMock({
      id: 'p1',
      tenantId: 'tn',
      brandProfileId: 'bp',
      originalText: null,
      text: 'B',
    });
    const claude = { complete: jest.fn() } as any;
    const usage = { record: jest.fn() } as any;
    await new LearningService(prisma, claude, usage).captureApproval('tn', 'p1');
    expect(claude.complete).not.toHaveBeenCalled();
  });
});
