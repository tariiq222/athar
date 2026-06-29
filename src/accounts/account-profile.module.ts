import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { AccountProfileController } from './account-profile.controller';
import { AccountProfileService } from './account-profile.service';

@Module({
  imports: [AuthModule, TenantModule],
  controllers: [AccountProfileController],
  providers: [AccountProfileService],
  exports: [AccountProfileService],
})
export class AccountProfileModule {}
