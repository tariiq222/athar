import { ERRORS, emailAlreadyExists, accountNotFound } from './error-envelope';

describe('error-envelope', () => {
  it('ERRORS catalog has every spec error code with status + arabic message', () => {
    expect(ERRORS.EMAIL_ALREADY_EXISTS).toEqual({
      statusCode: 409,
      error: 'EMAIL_ALREADY_EXISTS',
      message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
    });
    expect(ERRORS.INVALID_CREDENTIALS.statusCode).toBe(401);
    expect(ERRORS.ACCOUNT_NOT_FOUND.statusCode).toBe(404);
    expect(ERRORS.CONFIRMATION_REQUIRED.statusCode).toBe(422);
    expect(Object.keys(ERRORS).sort()).toEqual(
      [
        'ACCOUNT_NOT_FOUND',
        'CONFIRMATION_REQUIRED',
        'EMAIL_ALREADY_EXISTS',
        'INVALID_CREDENTIALS',
        'INVALID_REFRESH_TOKEN',
        'TOKEN_EXPIRED',
        'UNAUTHENTICATED',
        'VALIDATION_ERROR',
      ].sort(),
    );
  });

  it('AppException carries status code and exposes a typed envelope', () => {
    const ex = emailAlreadyExists();
    expect(ex.getStatus()).toBe(409);
    expect(ex.getEnvelope()).toEqual(ERRORS.EMAIL_ALREADY_EXISTS);
  });

  it('accountNotFound is 404 (never 403) to avoid leaking existence', () => {
    expect(accountNotFound().getStatus()).toBe(404);
  });
});