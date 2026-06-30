import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthTokens } from './auth.types';

// Sprint A — Task 10.1: per-route throttling on auth. We use the default
// ThrottlerGuard (per-IP). Tenant-scoped tracking doesn't apply here — auth
// requests have no resolved tenant yet.
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto);
  }
}