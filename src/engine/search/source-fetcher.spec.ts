import { SourceFetcher } from './source-fetcher';

describe('SourceFetcher', () => {
  const wl = ['reuters.com'];

  it('returns null for a non-whitelisted url without fetching', async () => {
    const httpGet = jest.fn();
    const f = new SourceFetcher(httpGet);
    expect(await f.fetchPage('https://evil.com/a', wl)).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('extracts title and stripped text from a whitelisted page', async () => {
    const html =
      '<html><head><title>SAMA report</title></head><body><p>Inflation is 2%.</p><script>x()</script></body></html>';
    const httpGet = jest.fn().mockResolvedValue(html);
    const f = new SourceFetcher(httpGet);
    const res = await f.fetchPage('https://www.reuters.com/x', wl);
    expect(res).toEqual({
      url: 'https://www.reuters.com/x',
      title: 'SAMA report',
      text: expect.stringContaining('Inflation is 2%.'),
    });
    expect(res!.text).not.toContain('x()');
  });

  it('returns null when the fetch throws', async () => {
    const httpGet = jest.fn().mockRejectedValue(new Error('timeout'));
    const f = new SourceFetcher(httpGet);
    expect(await f.fetchPage('https://reuters.com/x', wl)).toBeNull();
  });
});
