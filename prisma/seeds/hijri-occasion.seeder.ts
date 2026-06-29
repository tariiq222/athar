import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { OCCASION_DEFINITIONS } from './occasion-definitions';

const TARGET_GREGORIAN_YEAR = Number(
  process.env.SEED_YEAR ?? new Date().getUTCFullYear() + 1,
);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let written = 0;
    for (const def of OCCASION_DEFINITIONS) {
      const range = def.compute(TARGET_GREGORIAN_YEAR);
      for (const row of range) {
        // Prisma 7 rejects `null` in upsert.where for nullable unique columns,
        // so we do findFirst + create/update manually.
        const existing = await prisma.saudiOccasion.findFirst({
          where: {
            tenantId: row.tenantId,
            slug: row.slug,
            gregorianYear: TARGET_GREGORIAN_YEAR,
          },
        });
        if (existing) {
          await prisma.saudiOccasion.update({
            where: { id: existing.id },
            data: {
              kind: row.kind,
              nameAr: row.nameAr,
              nameEn: row.nameEn,
              startDate: row.startDate,
              endDate: row.endDate,
              hijriYear: row.hijriYear,
            },
          });
        } else {
          await prisma.saudiOccasion.create({ data: row });
        }
        written += 1;
      }
    }
    console.log(
      `[hijri-seeder] wrote ${written} occasion rows for gregorianYear=${TARGET_GREGORIAN_YEAR}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[hijri-seeder] failed:', err);
  process.exit(1);
});