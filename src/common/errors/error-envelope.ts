import { HttpException } from '@nestjs/common';

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
}

export const ERRORS = {
  EMAIL_ALREADY_EXISTS: {
    statusCode: 409,
    error: 'EMAIL_ALREADY_EXISTS',
    message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
  },
  INVALID_CREDENTIALS: {
    statusCode: 401,
    error: 'INVALID_CREDENTIALS',
    message: 'البريد أو كلمة المرور غير صحيحة.',
  },
  TOKEN_EXPIRED: {
    statusCode: 401,
    error: 'TOKEN_EXPIRED',
    message: 'انتهت الجلسة، جدّد الدخول.',
  },
  INVALID_REFRESH_TOKEN: {
    statusCode: 401,
    error: 'INVALID_REFRESH_TOKEN',
    message: 'جلسة غير صالحة، سجّل الدخول من جديد.',
  },
  UNAUTHENTICATED: {
    statusCode: 401,
    error: 'UNAUTHENTICATED',
    message: 'يلزم تسجيل الدخول.',
  },
  VALIDATION_ERROR: {
    statusCode: 422,
    error: 'VALIDATION_ERROR',
    message: 'تحقّق من صحّة المدخلات.',
  },
  ACCOUNT_NOT_FOUND: {
    statusCode: 404,
    error: 'ACCOUNT_NOT_FOUND',
    message: 'العنصر غير موجود.',
  },
  CONFIRMATION_REQUIRED: {
    statusCode: 422,
    error: 'CONFIRMATION_REQUIRED',
    message: 'يلزم تأكيد الحذف صراحةً.',
  },
} as const satisfies Record<string, ErrorEnvelope>;

export class AppException extends HttpException {
  private readonly envelopeMessage: string;

  constructor(
    private readonly statusCode: number,
    private readonly errorCode: string,
    message: string,
  ) {
    super({ statusCode, error: errorCode, message }, statusCode);
    this.envelopeMessage = message;
  }

  getEnvelope(): ErrorEnvelope {
    return {
      statusCode: this.statusCode,
      error: this.errorCode,
      message: this.envelopeMessage,
    };
  }
}

function make(e: ErrorEnvelope): AppException {
  return new AppException(e.statusCode, e.error, e.message);
}

export const emailAlreadyExists = () => make(ERRORS.EMAIL_ALREADY_EXISTS);
export const invalidCredentials = () => make(ERRORS.INVALID_CREDENTIALS);
export const tokenExpired = () => make(ERRORS.TOKEN_EXPIRED);
export const invalidRefreshToken = () => make(ERRORS.INVALID_REFRESH_TOKEN);
export const unauthenticated = () => make(ERRORS.UNAUTHENTICATED);
export const accountNotFound = () => make(ERRORS.ACCOUNT_NOT_FOUND);
export const confirmationRequired = () => make(ERRORS.CONFIRMATION_REQUIRED);