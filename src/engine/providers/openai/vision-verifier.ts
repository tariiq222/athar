import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { isArabicTextBroken } from '../../image/image-gate';
import { UsageRecorder } from '../../usage/usage.recorder';
import { textCostUsd } from '../../usage/pricing';
import { TenantContextService } from '../../../common/tenant-context.service';

/**
 * Reads Arabic text back out of a generated image with a vision model
 * and compares it to the intended text. Returns the read-back text plus
 * a `matches` boolean. Used by GptImageProvider (Task 16) to drive the
 * 2-3x regenerate loop when the rendered Arabic is broken.
 *
 * Records one `image_verify` UsageRecord per call so the per-post cost
 * (gpt-4o-mini prompt_tokens + completion_tokens × price) is tracked.
 */
@Injectable()
export class VisionVerifier {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private readonly usage: UsageRecorder,
    private readonly tenantContext: TenantContextService,
  ) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.model = config.get<string>('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';
  }

  async verify(
    bytes: Buffer,
    intendedText: string,
  ): Promise<{ verifiedText: string; matches: boolean }> {
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe ONLY the Arabic text visible in this image, verbatim. Output just the text.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    const pt = res.usage?.prompt_tokens ?? 0;
    const ct = res.usage?.completion_tokens ?? 0;
    await this.usage.record({
      tenantId: this.tenantContext.getTenantId(),
      kind: 'image_verify',
      units: pt + ct,
      costUsd: textCostUsd('gpt-4o-mini', pt, ct),
    });
    const verifiedText = (res.choices[0].message.content ?? '').trim();
    return {
      verifiedText,
      matches: !isArabicTextBroken(intendedText, verifiedText),
    };
  }
}