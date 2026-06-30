export type SaudiOccasionKind =
  'national' | 'foundation' | 'ramadan' | 'eid_fitr' | 'eid_adha' | 'commercial';

export const SAUDI_OCCASION_KINDS: readonly SaudiOccasionKind[] = [
  'national',
  'foundation',
  'ramadan',
  'eid_fitr',
  'eid_adha',
  'commercial',
];

export interface SaudiOccasion {
  id: string;
  tenantId: string | null; // null = public occasion for all tenants
  slug: string;
  kind: SaudiOccasionKind;
  nameAr: string;
  nameEn: string;
  startDate: string; // ISO date (yyyy-mm-dd)
  endDate: string; // ISO date — equals startDate for single-day occasions
  hijriYear: number;
  gregorianYear: number;
}
