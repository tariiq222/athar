import { textCostUsd, imageCostUsd } from './pricing';

describe('pricing', () => {
  describe('textCostUsd', () => {
    it('computes Claude Sonnet text cost for input tokens', () => {
      // 1000 in * 0.003/1k = 0.003 ; 500 out * 0.015/1k = 0.0075 ; sum = 0.0105
      expect(textCostUsd('claude-3-5-sonnet', 1000, 500)).toBeCloseTo(0.003 + 0.0075, 5);
    });

    it('computes Claude Haiku text cost', () => {
      // 2000 in * 0.0008/1k = 0.0016 ; 1000 out * 0.004/1k = 0.004 ; sum = 0.0056
      expect(textCostUsd('claude-3-5-haiku', 2000, 1000)).toBeCloseTo(0.0016 + 0.004, 5);
    });

    it('computes gpt-4o-mini text cost', () => {
      // 1000 in * 0.00015/1k = 0.00015 ; 1000 out * 0.0006/1k = 0.0006 ; sum = 0.00075
      expect(textCostUsd('gpt-4o-mini', 1000, 1000)).toBeCloseTo(0.00075, 6);
    });

    it('returns 0 for zero tokens', () => {
      expect(textCostUsd('claude-3-5-sonnet', 0, 0)).toBe(0);
    });
  });

  describe('imageCostUsd', () => {
    it('computes gpt-image cost per attempt', () => {
      expect(imageCostUsd('gpt-image-1', 1024, 1024, 3)).toBeGreaterThan(0.1);
    });

    it('returns 0 when attempts is 0', () => {
      expect(imageCostUsd('gpt-image-1', 1024, 1024, 0)).toBe(0);
    });

    it('scales linearly with attempts', () => {
      const one = imageCostUsd('gpt-image-1', 1024, 1024, 1);
      const two = imageCostUsd('gpt-image-1', 1024, 1024, 2);
      expect(two).toBeCloseTo(one * 2, 6);
    });
  });
});