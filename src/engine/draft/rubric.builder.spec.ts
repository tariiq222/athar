import { buildRubric } from './rubric.builder';
import type { BrandProfileInput } from '../types';

const brand: BrandProfileInput = {
  id: 'b',
  tenantId: 'tn',
  tone: 'professional',
  topics: ['x'],
  prohibitions: ['no slang'],
  competitors: [],
  keywords: [],
  learnedPreferences: '',
  brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
};

describe('buildRubric', () => {
  it('requires all five criteria to pass', () => {
    expect(buildRubric(brand, 'linkedin')).toEqual({
      toneMatch: true,
      sourceIntegrity: true,
      platformCompliance: true,
      prohibitions: true,
      clarity: true,
    });
  });
});