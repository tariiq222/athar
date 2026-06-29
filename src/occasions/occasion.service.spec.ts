import { Test } from '@nestjs/testing';
import { OccasionService } from './occasion.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OccasionService.list', () => {
  const tenantId = 't1';

  function makePrisma(rows: any[]) {
    return { saudiOccasion: { findMany: jest.fn().mockResolvedValue(rows) } };
  }

  it('passes date-overlap and tenant visibility to Prisma', async () => {
    const prisma = makePrisma([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    await svc.list(tenantId, { from: '2026-09-01', to: '2026-09-30' });

    expect(prisma.saudiOccasion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ startDate: { lte: new Date('2026-09-30') } }),
            expect.objectContaining({ endDate:   { gte: new Date('2026-09-01') } }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ tenantId: null }),
                expect.objectContaining({ tenantId }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('maps Prisma rows to SaudiOccasion wire format (ISO date strings)', async () => {
    const prisma = makePrisma([
      {
        id: 'o1',
        tenantId: null,
        slug: 'saudi-national-day',
        kind: 'national',
        nameAr: 'اليوم الوطني',
        nameEn: 'Saudi National Day',
        startDate: new Date('2026-09-23T00:00:00.000Z'),
        endDate: new Date('2026-09-23T00:00:00.000Z'),
        hijriYear: 1448,
        gregorianYear: 2026,
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    const res = await svc.list(tenantId, { from: '2026-09-01', to: '2026-09-30' });
    expect(res).toEqual([
      {
        id: 'o1',
        tenantId: null,
        slug: 'saudi-national-day',
        kind: 'national',
        nameAr: 'اليوم الوطني',
        nameEn: 'Saudi National Day',
        startDate: '2026-09-23',
        endDate: '2026-09-23',
        hijriYear: 1448,
        gregorianYear: 2026,
      },
    ]);
  });

  it('filters by kind when provided', async () => {
    const prisma = makePrisma([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    await svc.list(tenantId, { from: '2026-01-01', to: '2026-12-31', kind: 'ramadan' });
    expect(prisma.saudiOccasion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: 'ramadan' }),
      }),
    );
  });
});
