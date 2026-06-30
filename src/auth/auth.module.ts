import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuditLogModule } from '../common/audit/audit-log.module';

@Module({
  imports: [JwtModule.register({}), ConfigModule, AuditLogModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
