import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthTokens, SessionUser } from './auth.types';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import {
  emailAlreadyExists,
  invalidCredentials,
  invalidRefreshToken,
  unauthenticated,
} from '../common/errors/error-envelope';
import { AuditLogService } from '../common/audit/audit-log.service';
import { addDays } from '../common/date';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw emailAlreadyExists();

    const passwordHash = await this.passwords.hash(dto.password);
    const trialDays = Number(this.config.get<string>('TRIAL_DURATION_DAYS') ?? '7');
    const trialEndsAt = addDays(Date.now(), trialDays);

    // Sprint A — Task 4.1: PDPL consent capture. Stored on the user row so we
    // can prove the user agreed to a specific termsVersion on day-N audit.
    const consentGivenAt = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: dto.tenantName } });
      const created = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.name ?? null,
          passwordHash,
          role: 'owner',
          consentGivenAt,
          consentVersion: dto.termsVersion,
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

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.register',
      metadata: { termsVersion: dto.termsVersion },
    });

    return this.issueAndStore(user.id, user.tenantId);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (!user) {
      // Sprint A — Task 4.1: timing-equalizer. Without this, the missing-user
      // path returns ~immediately while the wrong-password path burns a hash
      // cycle — letting an attacker enumerate registered emails by latency.
      // Burn one hash to equalize; discard the result.
      await this.passwords.hash('*timing-equalizer*');
      throw invalidCredentials();
    }

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

  // Sprint A — Task 4: GET /auth/me populator. Reads the user that the JWT
  // claims to belong to (and which the SessionMiddleware attached to req.user),
  // joins the tenant's brand profile + subscription status, and shapes the
  // result into the SessionUser API contract. The single `findFirst` keeps the
  // handler round-trip to one DB query (the user row + the two tenant-side
  // relations are loaded in the same SELECT).
  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        tenant: {
          select: {
            brandProfiles: { select: { id: true }, take: 1 },
            subscriptions: {
              select: { status: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!user) throw unauthenticated();

    const subStatus = user.tenant.subscriptions[0]?.status ?? null;
    // Map Prisma enum (`trialing`) → API contract (`trial`). The DB keeps the
    // longer verb-form because it's used by the billing pipeline; the client
    // contract uses `trial` to match the marketing copy.
    const apiSub: SessionUser['subscriptionStatus'] =
      subStatus === 'trialing' ? 'trial' : subStatus;

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      onboardingCompleted: user.tenant.brandProfiles.length > 0,
      subscriptionStatus: apiSub,
      tenantId: user.tenantId,
    };
  }

  private async issueAndStore(userId: string, tenantId: string): Promise<AuthTokens> {
    const tokens = await this.tokens.issueTokens(userId, tenantId);
    const refreshTokenHash = await this.passwords.hash(tokens.refreshToken);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } });
    return tokens;
  }
}