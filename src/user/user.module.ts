import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TenantModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}