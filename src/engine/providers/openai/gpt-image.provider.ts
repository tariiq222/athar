import { Injectable } from '@nestjs/common';
import type { ImageProvider } from '../image-provider.interface';
import type { BrandKit, ImageAsset } from '../../types';
import type { Platform } from '../../../config/platform-limits';
import { getLimit } from '../../../config/platform-limits';
import { OpenAiImageClient } from './openai-image.client';
import { VisionVerifier } from './vision-verifier';
import { OverlayRenderer } from './overlay-renderer';
import { ImageStorageService } from '../../storage/image-storage.service';
import { UsageRecorder } from '../../usage/usage.recorder';
import { imageCostUsd } from '../../usage/pricing';
import { IMAGE_GATE_DECISION } from '../../image/image-gate.config';
import { TenantContextService } from '../../../common/tenant-context.service';

/**
 * The real ImageProvider. Honors the committed IMAGE_GATE_DECISION
 * (Task 1) so the primary path can be flipped without a code change.
 *
 *   - gate primary = gpt-image: generate with text, vision-verify,
 *     regenerate up to gptImageMaxAttempts; on persistent breakage,
 *     overlay fallback over the last generated background.
 *   - gate primary = overlay:   generate a text-free background, then
 *     render the Arabic text over it (skips verification entirely).
 *
 * The seam signature intentionally omits `tenantId`; PipelineService
 * wraps each per-tenant call in `tenantContext.runWithTenant(...)`
 * so UsageRecord rows carry the right tenant without polluting the seam.
 */
@Injectable()
export class GptImageProvider implements ImageProvider {
  constructor(
    private readonly imageClient: OpenAiImageClient,
    private readonly verifier: VisionVerifier,
    private readonly overlay: OverlayRenderer,
    private readonly storage: ImageStorageService,
    private readonly usage: UsageRecorder,
    private readonly tenantContext: TenantContextService,
  ) {}

  async generateImage(brief: string, kit: BrandKit, platform: Platform): Promise<ImageAsset> {
    const size = getLimit(platform).images.defaultSize;
    const sizeStr = `${size[0]}x${size[1]}`;
    const key = `posts/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

    if (IMAGE_GATE_DECISION.primaryMethod === 'overlay') {
      const bg = await this.imageClient.generate(this.backgroundPrompt(brief, kit), sizeStr);
      await this.recordImageUsage(size, 1);
      const composited = await this.overlay.render(bg, brief, kit, size);
      const url = await this.storage.upload(composited, key);
      return {
        url,
        verifiedText: brief,
        method: 'overlay-fallback',
        attempts: 1,
      };
    }

    let attempts = 0;
    const maxAttempts = IMAGE_GATE_DECISION.gptImageMaxAttempts;
    let lastBytes: Buffer = Buffer.alloc(0);

    while (attempts < maxAttempts) {
      attempts += 1;
      lastBytes = await this.imageClient.generate(this.textPrompt(brief, kit), sizeStr);
      await this.recordImageUsage(size, attempts);
      const { verifiedText, matches } = await this.verifier.verify(lastBytes, brief);
      if (matches) {
        const url = await this.storage.upload(lastBytes, key);
        return { url, verifiedText, method: 'gpt-image', attempts };
      }
    }

    // Persistent breakage -> overlay fallback over the last background.
    const composited = await this.overlay.render(lastBytes, brief, kit, size);
    const url = await this.storage.upload(composited, key);
    return {
      url,
      verifiedText: brief,
      method: 'overlay-fallback',
      attempts,
    };
  }

  private textPrompt(brief: string, kit: BrandKit): string {
    return (
      `${kit.visualStyle}. Brand colors ${kit.colors.join(', ')}. ` +
      `Render this Arabic text accurately, large and centered: "${brief}". Keep key elements in the center.`
    );
  }

  private backgroundPrompt(brief: string, kit: BrandKit): string {
    return (
      `${kit.visualStyle}. Brand colors ${kit.colors.join(', ')}. ` +
      `A background image (NO text) suitable for: "${brief}". Leave the center clear for an overlaid title.`
    );
  }

  private async recordImageUsage(size: readonly [number, number], attempts: number): Promise<void> {
    await this.usage.record({
      tenantId: this.tenantContext.getTenantId(),
      kind: 'image',
      units: 1,
      costUsd: imageCostUsd('gpt-image-1', size[0], size[1], attempts),
    });
  }
}
