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
  tenantId: string; // echoed for the client so the first call after register doesn't need to decode the JWT
  csrfToken?: string; // double-submit CSRF token, also mirrored into the csrf_token cookie
}

// Sprint A — Task 4: GET /auth/me response shape. The SessionUser is the
// single source of truth for "who is logged in" — the client uses it to decide
// onboarding state, gating, and the active tenant. The role enum and the
// subscription status enum are API-facing — the DB may store different
// representations (e.g. Prisma Subscription status uses 'trialing'; the API
// contract exposes 'trial').
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type ApiSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | null;

export interface SessionUser {
  user: { id: string; email: string; name: string | null; role: UserRole };
  onboardingCompleted: boolean;
  subscriptionStatus: ApiSubscriptionStatus;
  tenantId: string;
}
