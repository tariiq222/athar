import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { ConfigService } from '@nestjs/config';
import { AuthTokens, JwtPayload } from './auth.types';
import { invalidRefreshToken, tokenExpired, unauthenticated } from '../common/errors/error-envelope';

const SIGN_OPTS = {
  algorithm: 'HS256' as const,
  issuer: 'athar',
  audience: 'athar-api',
};
const VERIFY_OPTS = {
  algorithms: ['HS256' as const],
  issuer: 'athar',
  audience: 'athar-api',
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueTokens(userId: string, tenantId: string): Promise<AuthTokens> {
    const accessTtl = (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as StringValue;
    const refreshTtl = (this.config.get<string>('JWT_REFRESH_TTL') ?? '7d') as StringValue;

    const accessToken = await this.signAccess(
      { sub: userId, tenantId },
      { expiresIn: accessTtl },
    );
    const refreshToken = await this.signRefresh(
      { sub: userId, tenantId },
      { expiresIn: refreshTtl },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.ttlToSeconds(accessTtl),
      tenantId,
    };
  }

  async signAccess(
    payload: Pick<JwtPayload, 'sub' | 'tenantId'>,
    options?: { expiresIn?: StringValue; issuer?: string },
  ): Promise<string> {
    return this.jwt.signAsync(
      { ...payload, type: 'access' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        ...SIGN_OPTS,
        ...(options?.issuer ? { issuer: options.issuer } : {}),
        ...(options?.expiresIn ? { expiresIn: options.expiresIn } : { expiresIn: '15m' as StringValue }),
      },
    );
  }

  async signRefresh(
    payload: Pick<JwtPayload, 'sub' | 'tenantId'>,
    options?: { expiresIn?: StringValue },
  ): Promise<string> {
    return this.jwt.signAsync(
      { ...payload, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        ...SIGN_OPTS,
        ...(options?.expiresIn ? { expiresIn: options.expiresIn } : { expiresIn: '7d' as StringValue }),
      },
    );
  }

  async verifyAccess(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        ...VERIFY_OPTS,
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
        ...VERIFY_OPTS,
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
