export type PlanCode = 'trial' | 'business';

export interface PlanDefinition {
  code: PlanCode;
  nameAr: string;
  priceSar: number;
  // Sprint A — Task 5.1: `priceMinor` is the EX-VAT price (minor units).
  // `priceMinorInclusive` is what the customer actually pays, including the
  // 15% KSA VAT — it is `priceMinor` * (1 + vatRate), rounded to the nearest
  // halala. Activation accepts either amount so merchants using VAT-inclusive
  // checkout flows are not silently rejected.
  priceMinor: number;
  priceMinorInclusive: number;
  vatRate: number;
  annualPriceMinor: number;
  trialDays: number;
  monthlyDraftCap: number;
  monthlyImageCap: number;
  monthlySearchCap: number;
}

const KSA_VAT_RATE = 0.15;

export const TRIAL_PLAN: PlanDefinition = {
  code: 'trial',
  nameAr: 'تجربة مجانية',
  priceSar: 0,
  priceMinor: 0,
  priceMinorInclusive: 0,
  vatRate: 0,
  annualPriceMinor: 0,
  trialDays: 7,
  monthlyDraftCap: 10,
  monthlyImageCap: 5,
  monthlySearchCap: 10,
};

export const BUSINESS_PLAN: PlanDefinition = {
  code: 'business',
  nameAr: 'أعمال',
  priceSar: 599,
  priceMinor: 59900, // 599 SAR ex-VAT
  priceMinorInclusive: Math.round(59900 * (1 + KSA_VAT_RATE)), // 68885 = 599 + 15%
  vatRate: KSA_VAT_RATE,
  annualPriceMinor: 59900 * 10, // 2 months free on annual (ex-VAT)
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
