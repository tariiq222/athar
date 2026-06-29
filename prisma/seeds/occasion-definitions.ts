import moment from 'moment-hijri';

export interface SeedOccasionRow {
  tenantId: string | null; // null = public
  slug: string;
  kind: 'national' | 'foundation' | 'ramadan' | 'eid_fitr' | 'eid_adha' | 'commercial';
  nameAr: string;
  nameEn: string;
  startDate: Date;
  endDate: Date;
  hijriYear: number;
  gregorianYear: number;
}

export interface OccasionDefinition {
  slug: string;
  kind: SeedOccasionRow['kind'];
  nameAr: string;
  nameEn: string;
  // Returns one or more rows for the given target Gregorian year.
  compute: (gregorianYear: number) => SeedOccasionRow[];
}

// ---------- Fixed-Gregorian occasions ----------

const nationalDay: OccasionDefinition = {
  slug: 'saudi-national-day',
  kind: 'national',
  nameAr: 'اليوم الوطني السعودي',
  nameEn: 'Saudi National Day',
  compute: (y) => [
    {
      tenantId: null,
      slug: 'saudi-national-day',
      kind: 'national',
      nameAr: 'اليوم الوطني السعودي',
      nameEn: 'Saudi National Day',
      startDate: new Date(Date.UTC(y, 8, 23)), // Sep 23
      endDate: new Date(Date.UTC(y, 8, 23)),
      hijriYear: 0, // not Hijri-based
      gregorianYear: y,
    },
  ],
};

const foundationDay: OccasionDefinition = {
  slug: 'saudi-foundation-day',
  kind: 'foundation',
  nameAr: 'يوم التأسيس',
  nameEn: 'Saudi Foundation Day',
  compute: (y) => [
    {
      tenantId: null,
      slug: 'saudi-foundation-day',
      kind: 'foundation',
      nameAr: 'يوم التأسيس',
      nameEn: 'Saudi Foundation Day',
      startDate: new Date(Date.UTC(y, 1, 22)), // Feb 22
      endDate: new Date(Date.UTC(y, 1, 22)),
      hijriYear: 0,
      gregorianYear: y,
    },
  ],
};

// ---------- Hijri-computed occasions ----------

function hijriMonthStart(
  gregorianYear: number,
  hijriMonth: number,
  hijriDay: number,
): Date {
  // moment-hijri: create from Hijri date, convert to Gregorian.
  // iYear is Hijri year, iMonth is 0-indexed Hijri month, iDate is 1-indexed Hijri day.
  // The Hijri year that overlaps the requested Gregorian year is approximately
  // (gregorianYear - 579) — derived from Y = 622 + 0.97 * (H - 1) ⇒ H ≈ Y - 579.
  // moment-hijri then normalizes the date to the actual astronomical observation.
  const m = moment()
    .iYear(gregorianYear - 579)
    .iMonth(hijriMonth - 1)
    .iDate(hijriDay);
  return m.startOf('day').toDate();
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function hijriOccasion(
  slug: string,
  kind: SeedOccasionRow['kind'],
  nameAr: string,
  nameEn: string,
  hijriMonth: number,
  hijriDay: number,
  durationDays = 1,
): OccasionDefinition {
  return {
    slug,
    kind,
    nameAr,
    nameEn,
    compute: (gregorianYear) => {
      const start = hijriMonthStart(gregorianYear, hijriMonth, hijriDay);
      return [
        {
          tenantId: null,
          slug,
          kind,
          nameAr,
          nameEn,
          startDate: start,
          endDate: durationDays > 1 ? addDays(start, durationDays - 1) : start,
          hijriYear: 0, // filled in by withComputedHijriYear
          gregorianYear,
        },
      ];
    },
  };
}

const ramadan = hijriOccasion('ramadan', 'ramadan', 'شهر رمضان', 'Ramadan', 9, 1, 30);
const eidFitr = hijriOccasion('eid-fitr', 'eid_fitr', 'عيد الفطر', 'Eid al-Fitr', 10, 1, 4);
const eidAdha = hijriOccasion('eid-adha', 'eid_adha', 'عيد الأضحى', 'Eid al-Adha', 12, 10, 4);

// Hijri year for a Gregorian date is read back from moment-hijri after conversion,
// not just approximated (Hijri year ≈ Gregorian - 622).
function withComputedHijriYear(def: OccasionDefinition): OccasionDefinition {
  return {
    ...def,
    compute: (gregorianYear) => {
      const rows = def.compute(gregorianYear);
      return rows.map((r) => {
        const m = moment(r.startDate);
        const hijriYear = m.iYear();
        return { ...r, hijriYear };
      });
    },
  };
}

// ---------- Fixed commercial ranges (Gregorian) ----------

function commercialRange(
  slug: string,
  nameAr: string,
  nameEn: string,
  month: number,
  startDay: number,
  endDay: number,
): OccasionDefinition {
  return {
    slug,
    kind: 'commercial',
    nameAr,
    nameEn,
    compute: (y) => [
      {
        tenantId: null,
        slug,
        kind: 'commercial',
        nameAr,
        nameEn,
        startDate: new Date(Date.UTC(y, month - 1, startDay)),
        endDate: new Date(Date.UTC(y, month - 1, endDay)),
        hijriYear: 0,
        gregorianYear: y,
      },
    ],
  };
}

const backToSchool = commercialRange(
  'back-to-school',
  'موسم العودة للمدارس',
  'Back to School',
  8,
  20,
  31,
);
const whiteFriday = commercialRange(
  'white-friday',
  'الجمعة البيضاء',
  'White Friday',
  11,
  20,
  30,
);
const yearEndSale = commercialRange(
  'year-end-sale',
  'تخفيضات نهاية العام',
  'Year-end Sale',
  12,
  15,
  31,
);

export const OCCASION_DEFINITIONS: OccasionDefinition[] = [
  nationalDay,
  foundationDay,
  withComputedHijriYear(ramadan),
  withComputedHijriYear(eidFitr),
  withComputedHijriYear(eidAdha),
  backToSchool,
  whiteFriday,
  yearEndSale,
];