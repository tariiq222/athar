import { LearningService } from './learning.service';

function prismaMock(post: any) {
  return {
    post: { findUniqueOrThrow: jest.fn().mockResolvedValue(post) },
    brandProfile: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ learnedPreferences: 'existing.' }),
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
    await new LearningService(prisma, claude, usage).captureApproval('p1');
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'bp' },
      data: { learnedPreferences: 'existing.\nPrefers shorter sentences.' },
    });
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tn', kind: 'text' }),
    );
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
    await new LearningService(prisma, claude, usage).captureApproval('p1');
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
    await new LearningService(prisma, claude, usage).captureApproval('p1');
    expect(claude.complete).not.toHaveBeenCalled();
  });
});