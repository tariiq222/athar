import { MUTATION_METHODS, isMutation } from './http-methods';

describe('http-methods', () => {
  it('treats POST, PUT, PATCH, DELETE as mutations', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isMutation(method)).toBe(true);
      expect(MUTATION_METHODS.has(method)).toBe(true);
    }
  });

  it('treats GET, HEAD, OPTIONS as non-mutations (safe)', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isMutation(method)).toBe(false);
      expect(MUTATION_METHODS.has(method)).toBe(false);
    }
  });

  it('is case-sensitive (uppercase methods only, matching Express req.method)', () => {
    expect(isMutation('post')).toBe(false);
  });
});
