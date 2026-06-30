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

  it('does NOT set where.kind when kind is omitted', async () => {
    const prisma = makePrisma([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    await svc.list(tenantId, { from: '2026-01-01', to: '2026-12-31' });
    const callArg = prisma.saudiOccasion.findMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('kind');
  });

  it('always orders results by startDate asc then id asc', async () => {
    const prisma = makePrisma([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    await svc.list(tenantId, { from: '2026-01-01', to: '2026-12-31' });
    expect(prisma.saudiOccasion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns an empty array when Prisma returns no rows', async () => {
    const prisma = makePrisma([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    const result = await svc.list(tenantId, { from: '2026-01-01', to: '2026-12-31' });
    expect(result).toEqual([]);
  });

  it('maps multiple rows — public (tenantId null) and tenant-specific both appear', async () => {
    const baseRow = {
      slug: 'test',
      kind: 'commercial',
      nameAr: 'تجاري',
      nameEn: 'Commercial',
      startDate: new Date('2026-11-11T00:00:00.000Z'),
      endDate: new Date('2026-11-11T00:00:00.000Z'),
      hijriYear: 1448,
      gregorianYear: 2026,
    };
    const prisma = makePrisma([
      { ...baseRow, id: 'pub1', tenantId: null },
      { ...baseRow, id: 'tenant1', tenantId },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    const result = await svc.list(tenantId, { from: '2026-11-01', to: '2026-11-30' });
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 'pub1')?.tenantId).toBeNull();
    expect(result.find((r) => r.id === 'tenant1')?.tenantId).toBe(tenantId);
  });

  it('slices date to YYYY-MM-DD regardless of UTC time component', async () => {
    // Verify that midnight-UTC dates like 2026-09-23T00:00:00.000Z
    // still render as '2026-09-23', not '2026-09-22' from a TZ offset.
    const prisma = makePrisma([
      {
        id: 'o2',
        tenantId: null,
        slug: 'foundation-day',
        kind: 'foundation',
        nameAr: 'يوم التأسيس',
        nameEn: 'Foundation Day',
        startDate: new Date('2026-02-22T00:00:00.000Z'),
        endDate: new Date('2026-02-22T00:00:00.000Z'),
        hijriYear: 1447,
        gregorianYear: 2026,
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    const [occasion] = await svc.list(tenantId, { from: '2026-02-01', to: '2026-02-28' });
    expect(occasion.startDate).toBe('2026-02-22');
    expect(occasion.endDate).toBe('2026-02-22');
  });

  it('passes Date objects (not strings) to Prisma for from/to boundaries', async () => {
    const prisma = makePrisma([]);
    const moduleRef = await Test.createTestingModule({
      providers: [OccasionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const svc = moduleRef.get(OccasionService);

    await svc.list(tenantId, { from: '2026-03-01', to: '2026-03-31' });
    const callArg = prisma.saudiOccasion.findMany.mock.calls[0][0];
    const andClauses: any[] = callArg.where.AND;
    const startFilter = andClauses.find((c: any) => c.startDate);
    const endFilter = andClauses.find((c: any) => c.endDate);
    expect(startFilter.startDate.lte).toBeInstanceOf(Date);
    expect(endFilter.endDate.gte).toBeInstanceOf(Date);
  });
});
