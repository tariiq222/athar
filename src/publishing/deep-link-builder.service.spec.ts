import { DeepLinkBuilder } from './deep-link-builder.service';

describe('DeepLinkBuilder', () => {
  const b = new DeepLinkBuilder();

  it('LinkedIn returns the share-active composer URL', () => {
    expect(b.build('linkedin', 'anything')).toBe(
      'https://www.linkedin.com/feed/?shareActive=true',
    );
  });

  it('X injects short text into the intent (url-encoded)', () => {
    const url = b.build('x', 'Hello world');
    expect(url).toBe('https://x.com/intent/post?text=Hello%20world');
  });

  it('X opens an empty composer when text exceeds the 280 weighted budget', () => {
    const url = b.build('x', 'a'.repeat(281));
    expect(url).toBe('https://x.com/intent/post');
  });
});
