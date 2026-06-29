import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SaudiOccasion, SaudiOccasionKind } from './occasion.types';

export interface ListOccasionsParams {
  from: string;       // ISO date
  to: string;         // ISO date
  kind?: SaudiOccasionKind;
}

@Injectable()
export class OccasionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, params: ListOccasionsParams): Promise<SaudiOccasion[]> {
    // Date-overlap filter: an occasion row is in range if its [startDate, endDate]
    // overlaps the requested [from, to] window.
    //   overlap ⇔ row.startDate <= to AND row.endDate >= from
    const where: Prisma.SaudiOccasionWhereInput = {
      AND: [
        { startDate: { lte: new Date(params.to) } },
        { endDate:   { gte: new Date(params.from) } },
        {
          OR: [
            { tenantId: null },          // public — visible to all tenants
            { tenantId },                // tenant-specific
          ],
        },
      ],
    };
    if (params.kind) where.kind = params.kind;

    const rows = await this.prisma.saudiOccasion.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      slug: r.slug,
      kind: r.kind as SaudiOccasionKind,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      hijriYear: r.hijriYear,
      gregorianYear: r.gregorianYear,
    }));
  }
}
