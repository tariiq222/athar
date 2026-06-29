import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OnboardingInputDto } from './onboarding-input.dto';
import { BrandProfileDraftDto } from './brand-profile-draft.dto';

describe('OnboardingInputDto', () => {
  it('accepts a valid input with website and accounts', () => {
    const dto = plainToInstance(OnboardingInputDto, {
      websiteUrl: 'https://example.com',
      accounts: [{ platform: 'linkedin', handle: '@acme' }],
      consentAccepted: true,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a bad website url', () => {
    const dto = plainToInstance(OnboardingInputDto, {
      websiteUrl: 'not-a-url',
      accounts: [],
      consentAccepted: true,
    });
    const errors = validateSync(dto);
    expect(errors.map((e) => e.property)).toContain('websiteUrl');
  });

  it('rejects an unknown platform', () => {
    const dto = plainToInstance(OnboardingInputDto, {
      accounts: [{ platform: 'facebook' }],
      consentAccepted: true,
    });
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires consentAccepted to be a boolean', () => {
    const dto = plainToInstance(OnboardingInputDto, { accounts: [] });
    const errors = validateSync(dto);
    expect(errors.map((e) => e.property)).toContain('consentAccepted');
  });
});

describe('BrandProfileDraftDto', () => {
  it('rejects a draft with empty tone or empty topics', () => {
    const dto = plainToInstance(BrandProfileDraftDto, {
      tone: '',
      audience: 'a',
      goals: 'g',
      topics: [],
      prohibitions: [],
      competitors: [],
      keywords: [],
      brandKit: { colors: [], visualStyle: 's', font: 'f' },
      accounts: [],
    });
    const props = validateSync(dto).map((e) => e.property);
    expect(props).toEqual(expect.arrayContaining(['tone', 'topics']));
  });

  it('accepts a complete valid draft', () => {
    const dto = plainToInstance(BrandProfileDraftDto, {
      tone: 'friendly',
      audience: 'smb',
      goals: 'grow',
      topics: ['tips'],
      prohibitions: [],
      competitors: [],
      keywords: [],
      brandKit: { colors: ['#fff'], visualStyle: 'clean', font: 'IBM Plex Sans Arabic' },
      accounts: [{ platform: 'x', handle: '@acme' }],
    });
    expect(validateSync(dto)).toHaveLength(0);
  });
});