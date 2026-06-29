import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule, // provides TokenService (used by JwtAuthGuard inside TenantModule)
    TenantModule, // provides JwtAuthGuard, TenantGuard, CurrentTenant, TenantContext
  ],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService], // for CalendarService in Task 8
})
export class PostModule {}
