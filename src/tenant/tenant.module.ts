import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';

@Module({
  // PrismaModule is @Global() but listed here to make TenantGuard's dependency
  // on PrismaService explicit and to keep this module self-contained if the
  // global decorator is ever removed.
  imports: [AuthModule, PrismaModule],
  providers: [JwtAuthGuard, TenantGuard],
  exports: [JwtAuthGuard, TenantGuard],
})
export class TenantModule {}
