import { OverlayRenderer } from './overlay-renderer';
import type { BrandKit } from '../../types';

const satoriMock = jest.fn();
jest.mock('satori', () => ({
  __esModule: true,
  default: (...a: unknown[]) => satoriMock(...a),
}));

const composite = jest.fn().mockReturnThis();
const png = jest.fn().mockReturnThis();
const toBuffer = jest.fn().mockResolvedValue(Buffer.from('result-png'));
const resize = jest.fn().mockReturnThis();
jest.mock('sharp', () =>
  jest.fn().mockImplementation(() => ({ composite, png, toBuffer, resize })),
);

const kit: BrandKit = {
  colors: ['#0a0a0a'],
  visualStyle: 'clean',
  font: 'IBM Plex Sans Arabic',
};

describe('OverlayRenderer', () => {
  beforeEach(() => {
    satoriMock.mockReset();
    composite.mockClear();
    png.mockClear();
    toBuffer.mockClear();
    resize.mockClear();
  });

  it('renders svg via satori and composites it over the background', async () => {
    satoriMock.mockResolvedValue('<svg>text</svg>');
    const r = new OverlayRenderer(async () => Buffer.from('font-bytes'));
    const out = await r.render(Buffer.from('bg'), 'ابدأ الآن', kit, [1200, 1200]);
    expect(satoriMock).toHaveBeenCalled();
    expect(composite).toHaveBeenCalled();
    expect(out.toString()).toBe('result-png');
  });
});
