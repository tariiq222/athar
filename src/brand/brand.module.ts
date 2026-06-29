import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { AccountProfileModule } from '../accounts/account-profile.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { BrandController } from './brand.controller';
import { OnboardingService } from './onboarding.service';

// BrandModule reuses EngineModule's CONTENT_PROVIDER / SEARCH_PROVIDER bindings.
// AccountProfileModule is imported because OnboardingService.commit
// calls AccountProfileService.createForTenant (Task 11).
// TenantModule is imported because BrandController uses @UseGuards(JwtAuthGuard,
// TenantGuard) — and AuthModule is imported directly so the guards'
// dependency TokenService is in BrandModule's DI scope (Nest module
// encapsulation: transitive imports are NOT visible).
@Module({
  imports: [EngineModule, AccountProfileModule, TenantModule, AuthModule],
  controllers: [BrandController],
  providers: [OnboardingService],
})
export class BrandModule {}
