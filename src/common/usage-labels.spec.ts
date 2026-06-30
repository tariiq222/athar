import { kindLabel } from './usage-labels';

describe('kindLabel', () => {
  it('maps text → المسودّات', () => {
    expect(kindLabel('text')).toBe('المسودّات');
  });

  it('maps image → الصور', () => {
    expect(kindLabel('image')).toBe('الصور');
  });

  it('maps image_verify → الصور (shares the image label)', () => {
    expect(kindLabel('image_verify')).toBe('الصور');
  });

  it('maps search → عمليات البحث', () => {
    expect(kindLabel('search')).toBe('عمليات البحث');
  });

  it('falls back to the raw kind for unknown kinds', () => {
    expect(kindLabel('unknown_kind')).toBe('unknown_kind');
  });
});
