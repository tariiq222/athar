import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { isArabicTextBroken } from '../../../../test/image-gate/run-gate';

/**
 * Reads Arabic text back out of a generated image with a vision model
 * and compares it to the intended text. Returns the read-back text plus
 * a `matches` boolean. Used by GptImageProvider (Task 16) to drive the
 * 2-3x regenerate loop when the rendered Arabic is broken.
 */
@Injectable()
export class VisionVerifier {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.model = config.get<string>('OPENAI_VISION_MODEL')!;
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
    const verifiedText = (res.choices[0].message.content ?? '').trim();
    return {
      verifiedText,
      matches: !isArabicTextBroken(intendedText, verifiedText),
    };
  }
}