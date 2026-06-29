import {
  isArabicTextBroken,
  computeBreakageRate,
  decideMethod,
  GateSample,
} from './run-gate';

describe('image-gate breakage math', () => {
  it('flags broken when normalized verified text differs from intended', () => {
    expect(isArabicTextBroken('ابدأ الآن', 'ابدأ الآن')).toBe(false);
    // mangled letters / missing diacritics-insensitive mismatch
    expect(isArabicTextBroken('ابدأ الآن', 'اىدأ الان xx')).toBe(true);
  });

  it('treats whitespace and tatweel as non-breaking', () => {
    expect(isArabicTextBroken('نمو  الأعمال', 'نموـ الأعمال')).toBe(false);
  });

  it('computes breakage rate as broken/total', () => {
    const samples: GateSample[] = [
      { intendedText: 'a', verifiedText: 'a', broken: false },
      { intendedText: 'b', verifiedText: 'x', broken: true },
      { intendedText: 'c', verifiedText: 'c', broken: false },
      { intendedText: 'd', verifiedText: 'd', broken: false },
    ];
    expect(computeBreakageRate(samples)).toBeCloseTo(0.25, 5);
  });

  it('returns 0 for empty samples (no data → default to gpt-image)', () => {
    expect(computeBreakageRate([])).toBe(0);
  });

  it('picks gpt-image when breakage < 10%', () => {
    expect(decideMethod(0.05)).toEqual({ primaryMethod: 'gpt-image', gptImageMaxAttempts: 3 });
  });

  it('picks overlay when breakage >= 10%', () => {
    expect(decideMethod(0.1)).toEqual({ primaryMethod: 'overlay', gptImageMaxAttempts: 0 });
    expect(decideMethod(0.4)).toEqual({ primaryMethod: 'overlay', gptImageMaxAttempts: 0 });
  });
});