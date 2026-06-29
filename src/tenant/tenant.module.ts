import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';

@Module({
  imports: [AuthModule],
  providers: [JwtAuthGuard, TenantGuard],
  exports: [JwtAuthGuard, TenantGuard],
})
export class TenantModule {}
