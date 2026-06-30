import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EngineError } from '../../types';

/**
 * Thin wrapper around the OpenAI image API — the only file in the engine
 * that calls `openai.images.generate`. gpt-image writes Arabic text into
 * the image; Task 16 (GptImageProvider) is what decides primary vs overlay
 * and runs the verify loop.
 */
@Injectable()
export class OpenAiImageClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.model = config.get<string>('OPENAI_IMAGE_MODEL')!;
  }

  async generate(prompt: string, size: string): Promise<Buffer> {
    try {
      const res = await this.client.images.generate({
        model: this.model,
        prompt,
        size,
      });
      return Buffer.from(res.data![0].b64_json!, 'base64');
    } catch (err) {
      throw new EngineError(`gpt-image call failed: ${(err as Error).message}`, 'provider_error');
    }
  }
}
