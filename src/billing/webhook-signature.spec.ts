import { timingSafeEqual } from 'crypto';
import { verifyWebhookToken } from './webhook-signature';

describe('verifyWebhookToken', () => {
  it('returns true on matching tokens', () => {
    expect(verifyWebhookToken('abc123', 'abc123')).toBe(true);
  });

  it('returns false on mismatch', () => {
    expect(verifyWebhookToken('abc123', 'xyz999')).toBe(false);
  });

  it('returns false on different lengths', () => {
    expect(verifyWebhookToken('short', 'much-longer-token')).toBe(false);
  });

  it('uses constant-time comparison (no early-exit on mismatch)', () => {
    // We can only assert behavior, not timing — but ensure equal-length mismatches still return false.
    expect(verifyWebhookToken('aaaa', 'bbbb')).toBe(false);
  });
});