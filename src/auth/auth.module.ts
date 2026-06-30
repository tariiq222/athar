import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { CsrfController } from './csrf.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { CsrfService } from './csrf.service';
import { SessionCookieService } from './session-cookie.service';
import { SessionMiddleware } from './session.middleware';
import { AuditLogModule } from '../common/audit/audit-log.module';

@Module({
  imports: [JwtModule.register({}), ConfigModule, AuditLogModule],
  controllers: [AuthController, CsrfController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    CsrfService,
    SessionCookieService,
    SessionMiddleware,
  ],
  exports: [TokenService, PasswordService],
})
export class AuthModule implements NestModule {
  // Sprint A — Task 4: wire SessionMiddleware so that every request (matched
  // on '*' here) has its session_token cookie validated and req.user attached
  // before the controller handler runs. The middleware is registered globally
  // on AuthModule — once we expose /me outside the auth surface, we keep
  // validating identity on all routes that need it.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
