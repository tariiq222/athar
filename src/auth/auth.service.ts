import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthTokens } from './auth.types';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import {
  emailAlreadyExists,
  invalidCredentials,
  invalidRefreshToken,
} from '../common/errors/error-envelope';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw emailAlreadyExists();

    const passwordHash = await this.passwords.hash(dto.password);
    const trialDays = Number(this.config.get<string>('TRIAL_DURATION_DAYS') ?? '7');
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: dto.tenantName } });
      const created = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.name ?? null,
          passwordHash,
        },
      });
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          status: 'trialing',
          plan: 'trial',
          trialEndsAt,
        },
      });
      return created;
    });

    return this.issueAndStore(user.id, user.tenantId);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (!user) throw invalidCredentials();

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) throw invalidCredentials();

    return this.issueAndStore(user.id, user.tenantId);
  }

  async refresh(dto: RefreshDto): Promise<AuthTokens> {
    const payload = await this.tokens.verifyRefresh(dto.refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || !user.refreshTokenHash) throw invalidRefreshToken();

    // Rotation check: the presented token must match the currently-stored one.
    const matches = await this.passwords.verify(user.refreshTokenHash, dto.refreshToken);
    if (!matches) throw invalidRefreshToken();

    return this.issueAndStore(user.id, user.tenantId);
  }

  private async issueAndStore(userId: string, tenantId: string): Promise<AuthTokens> {
    const tokens = await this.tokens.issueTokens(userId, tenantId);
    const refreshTokenHash = await this.passwords.hash(tokens.refreshToken);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } });
    return tokens;
  }
}