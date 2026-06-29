import { Injectable } from '@nestjs/common';
import type {
  GenerationRequest,
  PipelineResult,
  Draft,
  ImageAsset,
} from '../types';
import { EngineError } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { LiveSearchProvider } from '../search/live-search.provider';
import { DraftStage } from '../draft/draft.stage';
import { CritiqueStage } from '../draft/critique.stage';
import { GptImageProvider } from '../providers/openai/gpt-image.provider';
import { AssembleStage, PlatformLimitExceeded } from '../assemble/assemble.stage';
import { UsageRecorder } from '../usage/usage.recorder';

/**
 * Orchestrates research → draft → critique → image → assemble for a
 * single GenerationRequest.
 *
 * Error-table enforcement:
 *   - pre-flight quota check yields skipped_quota (no provider work)
 *   - image provider_error degrades to a text-only post (image=null)
 *   - assemble PlatformLimitExceeded triggers ONE re-draft with a
 *     tighter brief before giving up
 */
@Injectable()
export class PipelineService {
  constructor(
    private readonly search: LiveSearchProvider,
    private readonly draftStage: DraftStage,
    private readonly critiqueStage: CritiqueStage,
    private readonly imageProvider: GptImageProvider,
    private readonly assembleStage: AssembleStage,
    private readonly usage: UsageRecorder,
  ) {}

  async generateOne(
    req: GenerationRequest,
    monthPlanId?: string,
  ): Promise<PipelineResult> {
    const { brandProfile: brand, platform, contentType } = req;

    if (await this.usage.isOverQuota(brand.tenantId)) {
      throw new EngineError('usage cap reached', 'skipped_quota');
    }

    const topic = req.topic ?? brand.topics[0] ?? '';
    const factSet = await this.search.research(topic, brand);

    const baseInput: DraftInput = { factSet, brand, platform, contentType, brief: req.brief };
    let draft: Draft = await this.draftStage.run(baseInput);
    const critiqued = await this.critiqueStage.run(draft, baseInput);
    draft = critiqued.draft;

    let image: ImageAsset | null = null;
    try {
      this.imageProvider.setTenant(brand.tenantId);
      image = await this.imageProvider.generateImage(
        draft.imageBrief,
        brand.brandKit,
        platform,
      );
    } catch (err) {
      if (err instanceof EngineError && err.kind === 'provider_error') {
        image = null;
      } else {
        throw err;
      }
    }

    const assembleArgs = {
      tenantId: brand.tenantId,
      brandProfileId: brand.id,
      draft,
      image,
      platform,
      quotaStatus: 'ok' as const,
      monthPlanId,
    };

    let postId: string;
    try {
      postId = await this.assembleStage.run(assembleArgs);
    } catch (err) {
      if (err instanceof PlatformLimitExceeded) {
        const tighterBrief =
          `${req.brief ?? ''} (Strictly shorter: exceed limit by ${err.overBy} fewer characters.)`.trim();
        const tighter: DraftInput = { ...baseInput, brief: tighterBrief };
        draft = await this.draftStage.run(tighter);
        postId = await this.assembleStage.run({ ...assembleArgs, draft });
      } else {
        throw err;
      }
    }

    return {
      postId,
      quotaStatus: 'ok',
      critiqueIssues: critiqued.issues,
      imageMethod: image ? image.method : null,
    };
  }
}