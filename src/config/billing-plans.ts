export type PlanCode = 'trial' | 'business';

export interface PlanDefinition {
  code: PlanCode;
  nameAr: string;
  priceSar: number;
  priceMinor: number;
  annualPriceMinor: number;
  billingCycle: 'monthly' | 'annual';
  trialDays: number;
  monthlyDraftCap: number;
  monthlyImageCap: number;
  monthlySearchCap: number;
}

export const TRIAL_PLAN: PlanDefinition = {
  code: 'trial',
  nameAr: 'تجربة مجانية',
  priceSar: 0,
  priceMinor: 0,
  annualPriceMinor: 0,
  billingCycle: 'monthly',
  trialDays: 7,
  monthlyDraftCap: 10,
  monthlyImageCap: 5,
  monthlySearchCap: 10,
};

export const BUSINESS_PLAN: PlanDefinition = {
  code: 'business',
  nameAr: 'أعمال',
  priceSar: 599,
  priceMinor: 59900,
  annualPriceMinor: 59900 * 10, // 2 months free on annual
  billingCycle: 'monthly',
  trialDays: 0,
  monthlyDraftCap: 60,
  monthlyImageCap: 30,
  monthlySearchCap: 200,
};

const PLANS: Record<PlanCode, PlanDefinition> = {
  trial: TRIAL_PLAN,
  business: BUSINESS_PLAN,
};

export function resolvePlan(code: string): PlanDefinition {
  const plan = PLANS[code as PlanCode];
  if (!plan) throw new Error(`Unknown plan code: ${code}`);
  return plan;
}
