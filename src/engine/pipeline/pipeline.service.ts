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
 *   - per-kind pre-flight quota checks (text → search → image) yield
 *     `skipped_quota` so MonthPlanProcessor can mark and skip (no retry)
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

    // Per-kind pre-check: search runs implicitly through research() below;
    // text and image get their own check here.
    const plan = await this.usage.getCurrentPlan(brand.tenantId);
    const textDecision = await this.usage.canConsume(brand.tenantId, 'text', plan);
    if (!textDecision.allowed) {
      throw new EngineError(textDecision.reason ?? 'text quota exceeded', 'skipped_quota');
    }

    const topic = req.topic ?? brand.topics[0] ?? '';
    const factSet = await this.search.research(topic, brand); // also pre-checks 'search'

    const baseInput: DraftInput = { factSet, brand, platform, contentType, brief: req.brief };
    let draft: Draft = await this.draftStage.run(baseInput);
    const critiqued = await this.critiqueStage.run(draft, baseInput);
    draft = critiqued.draft;

    const imageDecision = await this.usage.canConsume(brand.tenantId, 'image', plan);
    if (!imageDecision.allowed) {
      throw new EngineError(imageDecision.reason ?? 'image quota exceeded', 'skipped_quota');
    }

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