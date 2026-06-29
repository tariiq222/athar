import { TRIAL_PLAN, BUSINESS_PLAN, resolvePlan } from './billing-plans';

describe('billing-plans', () => {
  it('TRIAL_PLAN has zero price and 7-day trial', () => {
    expect(TRIAL_PLAN.code).toBe('trial');
    expect(TRIAL_PLAN.priceMinor).toBe(0);
    expect(TRIAL_PLAN.trialDays).toBe(7);
    expect(TRIAL_PLAN.monthlyDraftCap).toBeLessThan(BUSINESS_PLAN.monthlyDraftCap);
    expect(TRIAL_PLAN.monthlyImageCap).toBeLessThan(BUSINESS_PLAN.monthlyImageCap);
    expect(TRIAL_PLAN.monthlySearchCap).toBeLessThan(BUSINESS_PLAN.monthlySearchCap);
  });

  it('BUSINESS_PLAN is 59900 halalas (599 SAR)', () => {
    expect(BUSINESS_PLAN.code).toBe('business');
    expect(BUSINESS_PLAN.priceMinor).toBe(59900);
    expect(BUSINESS_PLAN.priceSar).toBe(599);
    expect(BUSINESS_PLAN.annualPriceMinor).toBeLessThan(BUSINESS_PLAN.priceMinor * 12);
  });

  it('resolvePlan returns the matching plan; unknown throws', () => {
    expect(resolvePlan('trial').code).toBe('trial');
    expect(resolvePlan('business').code).toBe('business');
    expect(() => resolvePlan('enterprise')).toThrow();
  });
});
