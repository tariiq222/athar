import { ExportFormatter } from './export-formatter.service';

describe('ExportFormatter', () => {
  const fmt = new ExportFormatter();

  it('LinkedIn: appends hashtags, puts link in body, notes preview-card removal, limit 3000', () => {
    const r = fmt.format({
      platform: 'linkedin',
      text: 'Hello world',
      hashtags: ['#a', '#b', '#c'],
      link: 'https://example.com',
    });
    expect(r.limitMax).toBe(3000);
    expect(r.formattedText).toContain('Hello world');
    expect(r.formattedText).toContain('#a #b #c');
    expect(r.formattedText).toContain('https://example.com'); // link in body
    expect(r.link).toEqual({ url: 'https://example.com', placement: 'in_body' });
    expect(r.notes.join(' ')).toMatch(/preview card|بطاقة المعاينة/);
    expect(r.charCount).toBe(r.formattedText.length);
  });

  it('X: keeps link OUT of body (first_reply) and counts weighted length, limit 280', () => {
    const r = fmt.format({
      platform: 'x',
      text: 'Short post',
      hashtags: ['#a'],
      link: 'https://example.com',
    });
    expect(r.limitMax).toBe(280);
    expect(r.formattedText).toContain('Short post');
    expect(r.formattedText).toContain('#a');
    expect(r.formattedText).not.toContain('https://example.com'); // link goes to a reply
    expect(r.link).toEqual({ url: 'https://example.com', placement: 'first_reply' });
    expect(r.charCount).toBeLessThanOrEqual(280);
  });

  it('X: weighted count treats Arabic as weight 1 (full ~280 budget)', () => {
    const arabic = 'ا'.repeat(279);
    const r = fmt.format({ platform: 'x', text: arabic, hashtags: [] });
    expect(r.charCount).toBe(279); // weight 1 per Arabic char (not CJK)
  });

  it('throws EXCEEDS_PLATFORM_LIMIT when X body is over 280 weighted', () => {
    const tooLong = 'a'.repeat(281);
    expect(() => fmt.format({ platform: 'x', text: tooLong, hashtags: [] })).toThrow(
      expect.objectContaining({ code: 'EXCEEDS_PLATFORM_LIMIT' }),
    );
  });

  it('throws EXCEEDS_PLATFORM_LIMIT when LinkedIn body is over 3000', () => {
    const tooLong = 'a'.repeat(3001);
    expect(() => fmt.format({ platform: 'linkedin', text: tooLong, hashtags: [] })).toThrow(
      expect.objectContaining({ code: 'EXCEEDS_PLATFORM_LIMIT' }),
    );
  });

  it('formats with no link and no hashtags cleanly', () => {
    const r = fmt.format({ platform: 'linkedin', text: 'Just text', hashtags: [] });
    expect(r.formattedText).toBe('Just text');
    expect(r.link).toBeUndefined();
  });
});
