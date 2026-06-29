import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule, TenantModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}