export interface JwtPayload {
  sub: string; // userId
  tenantId: string; // tenant scope — the single source of isolation truth
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // access-token lifetime in seconds
}