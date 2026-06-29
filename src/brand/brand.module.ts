import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';

// BrandModule reuses EngineModule's CONTENT_PROVIDER / SEARCH_PROVIDER bindings
// (the real providers carry stub summarize/fetch from Task 1 step 7b).
// Fakes are test-only — swap them in via overrideProvider in spec files.
@Module({
  imports: [EngineModule],
  controllers: [BrandController],
  providers: [OnboardingService],
})
export class BrandModule {}
