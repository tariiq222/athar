import { CsrfService } from './csrf.service';

describe('CsrfService', () => {
  const svc = new CsrfService();

  it('issue() returns token and cookieValue that are equal strings', () => {
    const { token, cookieValue } = svc.issue();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(token).toBe(cookieValue);
  });

  it('issue() returns a different token each call', () => {
    const a = svc.issue();
    const b = svc.issue();
    expect(a.token).not.toBe(b.token);
  });

  it('verify() accepts matching header and cookie', () => {
    const { token } = svc.issue();
    expect(svc.verify({ headerToken: token, cookieValue: token })).toBe(true);
  });

  it('verify() rejects mismatched header vs cookie', () => {
    const a = svc.issue();
    const b = svc.issue();
    expect(svc.verify({ headerToken: a.token, cookieValue: b.token })).toBe(false);
  });

  it('verify() rejects empty header', () => {
    const { token } = svc.issue();
    expect(svc.verify({ headerToken: '', cookieValue: token })).toBe(false);
  });
});
