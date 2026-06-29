import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

import { ClaudeClient } from './providers/claude/claude.client';
import { ClaudeContentProvider } from './providers/claude/claude-content.provider';
import { OpenAiImageClient } from './providers/openai/openai-image.client';
import { VisionVerifier } from './providers/openai/vision-verifier';
import { OverlayRenderer } from './providers/openai/overlay-renderer';
import { GptImageProvider } from './providers/openai/gpt-image.provider';
import { ImageStorageService } from './storage/image-storage.service';

import { SourceFetcher } from './search/source-fetcher';
import { FactExtractor } from './search/fact-extractor';
import {
  LiveSearchProvider,
  CandidateUrlProvider,
} from './search/live-search.provider';

import { UsageRecorder } from './usage/usage.recorder';
import { DraftStage } from './draft/draft.stage';
import { CritiqueStage } from './draft/critique.stage';
import { AssembleStage } from './assemble/assemble.stage';
import { PipelineService } from './pipeline/pipeline.service';

import { MonthPlanProcessor } from './month-plan/month-plan.processor';
import { MonthPlanService } from './month-plan/month-plan.service';
import { LearningService } from './learning/learning.service';

// Real candidate URL provider: a whitelist-restricted web search.
// Replace the body with a live search SDK call (results filtered by
// isDomainAllowed at fetch time in SourceFetcher). For now this returns
// site-scoped query URLs — sufficient as a placeholder for the seam.
const candidateUrlProvider: CandidateUrlProvider = async (topic, whitelist) =>
  whitelist.map(
    (domain) => `https://${domain}/?q=${encodeURIComponent(topic)}`,
  );

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    ClaudeClient,
    OpenAiImageClient,
    VisionVerifier,
    OverlayRenderer,
    ImageStorageService,
    SourceFetcher,
    FactExtractor,
    UsageRecorder,
    DraftStage,
    CritiqueStage,
    AssembleStage,
    PipelineService,
    MonthPlanProcessor,
    MonthPlanService,
    LearningService,
    ClaudeContentProvider,
    GptImageProvider,
    { provide: 'CANDIDATE_URL_PROVIDER', useValue: candidateUrlProvider },
    {
      provide: LiveSearchProvider,
      inject: [SourceFetcher, FactExtractor, UsageRecorder, 'CANDIDATE_URL_PROVIDER'],
      useFactory: (
        f: SourceFetcher,
        e: FactExtractor,
        u: UsageRecorder,
        c: CandidateUrlProvider,
      ) => new LiveSearchProvider(f, e, u, c),
    },
    // Seam token bindings: consumers depend on the interface, not the
    // concrete class — swap impls without touching call sites.
    { provide: 'ContentProvider', useExisting: ClaudeContentProvider },
    { provide: 'ImageProvider', useExisting: GptImageProvider },
    { provide: 'SearchProvider', useExisting: LiveSearchProvider },
  ],
  exports: [
    PipelineService,
    MonthPlanService,
    LearningService,
    UsageRecorder,
    // Seam tokens exported so BrandModule (and future consumers) can resolve
    // them through EngineModule's real-provider bindings.
    'ContentProvider',
    'ImageProvider',
    'SearchProvider',
  ],
})
export class EngineModule {}
