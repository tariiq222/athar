import { GptImageProvider } from './gpt-image.provider';
import { TenantContextService } from '../../../common/tenant-context.service';
import type { BrandKit } from '../../types';

jest.mock('../../image/image-gate.config', () => ({
  IMAGE_GATE_DECISION: { primaryMethod: 'gpt-image', gptImageMaxAttempts: 3 },
}));

const kit: BrandKit = {
  colors: ['#000'],
  visualStyle: 'clean',
  font: 'IBM Plex Sans Arabic',
};

function deps(over: Partial<Record<string, unknown>> = {}) {
  return {
    imageClient: {
      generate: jest.fn().mockResolvedValue(Buffer.from('img')),
    },
    verifier: { verify: jest.fn() },
    overlay: { render: jest.fn().mockResolvedValue(Buffer.from('overlaid')) },
    storage: {
      upload: jest.fn().mockResolvedValue('http://minio/athar-images/p.png'),
    },
    usage: { record: jest.fn().mockResolvedValue(undefined) },
    tenantContext: new TenantContextService(),
    ...over,
  };
}

describe('GptImageProvider', () => {
  it('returns gpt-image method on first verify success and records usage with the active tenant', async () => {
    const d = deps();
    (d.verifier.verify as jest.Mock).mockResolvedValue({
      verifiedText: 'ابدأ',
      matches: true,
    });
    const p = new GptImageProvider(
      d.imageClient as any,
      d.verifier as any,
      d.overlay as any,
      d.storage as any,
      d.usage as any,
      d.tenantContext,
    );
    const asset = await d.tenantContext.runWithTenant('tn', () =>
      p.generateImage('ابدأ', kit, 'linkedin'),
    );
    expect(asset).toEqual({
      url: 'http://minio/athar-images/p.png',
      verifiedText: 'ابدأ',
      method: 'gpt-image',
      attempts: 1,
    });
    expect(d.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tn', kind: 'image' }),
    );
  });

  it('does not expose setTenant on the seam — callers cannot mutate tenantId', () => {
    const d = deps();
    const p = new GptImageProvider(
      d.imageClient as any,
      d.verifier as any,
      d.overlay as any,
      d.storage as any,
      d.usage as any,
      d.tenantContext,
    );
    expect((p as unknown as { setTenant?: unknown }).setTenant).toBeUndefined();
  });

  it('records usage as "unknown" when called outside any tenant context', async () => {
    const d = deps();
    (d.verifier.verify as jest.Mock).mockResolvedValue({
      verifiedText: 'ابدأ',
      matches: true,
    });
    const p = new GptImageProvider(
      d.imageClient as any,
      d.verifier as any,
      d.overlay as any,
      d.storage as any,
      d.usage as any,
      d.tenantContext,
    );
    await p.generateImage('ابدأ', kit, 'linkedin');
    expect(d.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'unknown', kind: 'image' }),
    );
  });

  it('falls back to overlay after attempts exhausted', async () => {
    const d = deps();
    (d.verifier.verify as jest.Mock).mockResolvedValue({
      verifiedText: 'broken',
      matches: false,
    });
    const p = new GptImageProvider(
      d.imageClient as any,
      d.verifier as any,
      d.overlay as any,
      d.storage as any,
      d.usage as any,
      d.tenantContext,
    );
    const asset = await d.tenantContext.runWithTenant('tn', () =>
      p.generateImage('ابدأ', kit, 'x'),
    );
    expect(asset.method).toBe('overlay-fallback');
    expect(asset.verifiedText).toBe('ابدأ'); // intended text used for overlay
    expect(asset.attempts).toBe(3);
    expect(d.overlay.render).toHaveBeenCalled();
  });

  it('overlay-primary gate path skips verification and overlays directly', async () => {
    jest.resetModules();
    jest.doMock('../../image/image-gate.config', () => ({
      IMAGE_GATE_DECISION: { primaryMethod: 'overlay', gptImageMaxAttempts: 0 },
    }));
    const mod = await import('./gpt-image.provider');
    const OverlayPrimary = mod.GptImageProvider;
    const d = deps();
    const p = new OverlayPrimary(
      d.imageClient as any,
      d.verifier as any,
      d.overlay as any,
      d.storage as any,
      d.usage as any,
      d.tenantContext,
    );
    const asset = await d.tenantContext.runWithTenant('tn', () =>
      p.generateImage('ابدأ', kit, 'linkedin'),
    );
    expect(asset.method).toBe('overlay-fallback');
    expect(d.verifier.verify).not.toHaveBeenCalled();
    expect(asset.attempts).toBe(1);
  });
});
