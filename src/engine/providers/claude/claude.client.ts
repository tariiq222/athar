import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { EngineError } from '../../types';
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_HEADERS,
  requireOpenRouterKey,
} from '../openrouter';

export interface CompleteOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Thin Anthropic SDK wrapper — the only file importing `@anthropic-ai/sdk`.
 *
 * Pointed at OpenRouter (`OPENROUTER_BASE_URL`) so Claude runs through
 * the same routing/failover as the rest of the engine (vision, image).
 * Other modules read `ANTHROPIC_MODEL` and `OPENROUTER_API_KEY` from
 * ConfigService; nothing else touches the SDK directly.
 */
@Injectable()
export class ClaudeClient {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey =
      config.get<string>('OPENROUTER_API_KEY') ??
      (process.env.OPENROUTER_API_KEY || requireOpenRouterKey());
    this.anthropic = new Anthropic({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: OPENROUTER_HEADERS,
    });
    this.model = config.get<string>('ANTHROPIC_MODEL')!;
  }

  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    try {
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens ?? 2048,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      });
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as unknown as { text: string }).text)
        .join('');
      return {
        text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    } catch (err) {
      throw new EngineError(
        `Anthropic call failed: ${(err as Error).message}`,
        'provider_error',
      );
    }
  }
}