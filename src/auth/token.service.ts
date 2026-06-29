import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { ConfigService } from '@nestjs/config';
import { AuthTokens, JwtPayload } from './auth.types';
import { invalidRefreshToken, tokenExpired, unauthenticated } from '../common/errors/error-envelope';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueTokens(userId: string, tenantId: string): Promise<AuthTokens> {
    const accessTtl = (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as StringValue;
    const refreshTtl = (this.config.get<string>('JWT_REFRESH_TTL') ?? '7d') as StringValue;

    const accessToken = await this.jwt.signAsync(
      { sub: userId, tenantId, type: 'access' },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tenantId, type: 'refresh' },
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: refreshTtl },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.ttlToSeconds(accessTtl),
    };
  }

  async verifyAccess(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== 'access') throw unauthenticated();
      return payload;
    } catch (err) {
      if (err instanceof TokenExpiredError) throw tokenExpired();
      throw unauthenticated();
    }
  }

  async verifyRefresh(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh') throw invalidRefreshToken();
      return payload;
    } catch (err) {
      if (err instanceof TokenExpiredError) throw tokenExpired();
      throw invalidRefreshToken();
    }
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return Number(ttl) || 0;
    const value = Number(match[1]);
    const unit = match[2];
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
    return value * factor;
  }
}
