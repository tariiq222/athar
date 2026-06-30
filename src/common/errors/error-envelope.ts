import { HttpException } from '@nestjs/common';
import { kindLabel } from '../usage-labels';

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  fields?: string[];
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
  VALIDATION_FAILED: {
    statusCode: 400,
    error: 'VALIDATION_FAILED',
    message: 'تحقّق من صحّة المدخلات.',
  },
  RANGE_TOO_WIDE: {
    statusCode: 400,
    error: 'RANGE_TOO_WIDE',
    message: 'الفترة المطلوبة تتجاوز ٩٢ يوماً.',
  },
  INVALID_TRANSITION: {
    statusCode: 409,
    error: 'INVALID_TRANSITION',
    message: 'انتقال حالة غير مسموح به.',
  },
  CONTENT_LOCKED: {
    statusCode: 409,
    error: 'CONTENT_LOCKED',
    message: 'لا يمكن تعديل محتوى منشور مُعتمد. اسحبه للمراجعة أولاً.',
  },
  NOT_FOUND: {
    statusCode: 404,
    error: 'NOT_FOUND',
    message: 'العنصر غير موجود.',
  },
  PUBLISH_NOT_ALLOWED_HERE: {
    statusCode: 422,
    error: 'PUBLISH_NOT_ALLOWED_HERE',
    message: 'النشر يتم في المرحلة الخامسة، وليس من هنا.',
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
  // Phase 5 — assisted manual publishing (FR-11/FR-12/FR-13, US-5.1/5.2/5.3)
  NOT_APPROVED: {
    statusCode: 409,
    error: 'NOT_APPROVED',
    message: 'لا يمكن تصدير بوست غير معتمد.',
  },
  EXCEEDS_PLATFORM_LIMIT: {
    statusCode: 422,
    error: 'EXCEEDS_PLATFORM_LIMIT',
    message: 'النص بعد التنسيق يتجاوز حدّ المنصة.',
  },
  INVALID_STATUS_TRANSITION: {
    statusCode: 409,
    error: 'INVALID_STATUS_TRANSITION',
    message: 'انتقال حالة غير مسموح به. النشر يتم فقط من approved.',
  },
  REMIND_AT_REQUIRED: {
    statusCode: 422,
    error: 'REMIND_AT_REQUIRED',
    message: 'يلزم تحديد remindAt أو أن يكون للبوست scheduledAt.',
  },
  REMIND_AT_IN_PAST: {
    statusCode: 422,
    error: 'REMIND_AT_IN_PAST',
    message: 'remindAt يجب أن يكون في المستقبل.',
  },
  REMINDER_ALREADY_SENT: {
    statusCode: 409,
    error: 'REMINDER_ALREADY_SENT',
    message: 'لا يمكن إلغاء تذكير تم إرساله.',
  },
  // Phase 6 — billing (FR-15)
  QUOTA_EXCEEDED: {
    statusCode: 402,
    error: 'QUOTA_EXCEEDED',
    message: 'تجاوزت سقف الباقة.',
  },
  PAYMENT_FAILED: {
    statusCode: 402,
    error: 'PAYMENT_FAILED',
    message: 'فشلت عملية الدفع.',
  },
  WEBHOOK_SIGNATURE_INVALID: {
    statusCode: 401,
    error: 'WEBHOOK_SIGNATURE_INVALID',
    message: 'توقيع الـwebhook غير صالح.',
  },
  INVOICE_NOT_FOUND: {
    statusCode: 404,
    error: 'INVOICE_NOT_FOUND',
    message: 'الفاتورة غير موجودة.',
  },
} as const satisfies Record<string, ErrorEnvelope>;

export class AppError extends HttpException {
  readonly code: string;
  private readonly envelopeMessage: string;
  private readonly envelopeFields?: string[];

  constructor(
    private readonly statusCode: number,
    errorCode: string,
    message: string,
    fields?: string[],
  ) {
    super({ statusCode, error: errorCode, message, fields }, statusCode);
    this.envelopeMessage = message;
    this.code = errorCode;
    this.envelopeFields = fields;
  }

  getEnvelope(): ErrorEnvelope {
    return {
      statusCode: this.statusCode,
      error: this.code,
      message: this.envelopeMessage,
      ...(this.envelopeFields && this.envelopeFields.length > 0
        ? { fields: this.envelopeFields }
        : {}),
    };
  }
}

function make(e: ErrorEnvelope): AppError {
  return new AppError(e.statusCode, e.error, e.message);
}

export const emailAlreadyExists = () => make(ERRORS.EMAIL_ALREADY_EXISTS);
export const invalidCredentials = () => make(ERRORS.INVALID_CREDENTIALS);
export const tokenExpired = () => make(ERRORS.TOKEN_EXPIRED);
export const invalidRefreshToken = () => make(ERRORS.INVALID_REFRESH_TOKEN);
export const unauthenticated = () => make(ERRORS.UNAUTHENTICATED);
export const accountNotFound = () => make(ERRORS.ACCOUNT_NOT_FOUND);
export const confirmationRequired = () => make(ERRORS.CONFIRMATION_REQUIRED);
export const validationFailed = () => make(ERRORS.VALIDATION_FAILED);
export const rangeTooWide = () => make(ERRORS.RANGE_TOO_WIDE);
export const invalidTransition = () => make(ERRORS.INVALID_TRANSITION);
export const contentLocked = () => make(ERRORS.CONTENT_LOCKED);
export const notFound = () => make(ERRORS.NOT_FOUND);
export const publishNotAllowedHere = () => make(ERRORS.PUBLISH_NOT_ALLOWED_HERE);

// Phase 5 error helpers
export const notApproved = () => make(ERRORS.NOT_APPROVED);
export const exceedsPlatformLimit = (charCount: number, limitMax: number) =>
  new AppError(
    422,
    'EXCEEDS_PLATFORM_LIMIT',
    `النص بعد التنسيق (${charCount} حرفاً) يتجاوز حدّ المنصة (${limitMax}).`,
  );
export const invalidStatusTransition = (currentStatus: string) =>
  new AppError(
    409,
    'INVALID_STATUS_TRANSITION',
    `النشر مسموح فقط من approved؛ الحالة الحالية: ${currentStatus}.`,
  );
export const remindAtRequired = () => make(ERRORS.REMIND_AT_REQUIRED);
export const remindAtInPast = () => make(ERRORS.REMIND_AT_IN_PAST);
export const reminderAlreadySent = () => make(ERRORS.REMINDER_ALREADY_SENT);

// Phase 6 — billing error helpers
export const quotaExceeded = (kind: string, used: number, cap: number) =>
  new AppError(
    402,
    'QUOTA_EXCEEDED',
    `بلغت سقف الباقة الشهري (${used}/${cap}) لـ${kindLabel(kind)}.`,
  );

export const paymentFailed = (reason: string) =>
  new AppError(402, 'PAYMENT_FAILED', `فشلت عملية الدفع: ${reason}.`);

export const webhookSignatureInvalid = () => make(ERRORS.WEBHOOK_SIGNATURE_INVALID);

export const invoiceNotFound = () => make(ERRORS.INVOICE_NOT_FOUND);

// Sprint A — Task 5.1: payment amount did not match the expected price (either
// ex-VAT or VAT-inclusive). 422 because the request itself is malformed —
// the merchant's pricing doesn't match what we expect for this plan.
export const amountMismatch = (actual: number, allowed: number[]) =>
  new AppError(
    422,
    'AMOUNT_MISMATCH',
    `مبلغ الدفعة (${actual} هللة) غير مطابق للسعر المتوقع (${allowed.join(' أو ')} هللة).`,
  );

// Sprint A — Task 2.2: tenant isolation cross-check. Security violation
// means a JWT tenant claim did not match the user's actual tenant in DB,
// or the referenced user does not exist — i.e. a forged or stale token.
export const securityViolation = (reason: string) =>
  new AppError(403, reason, 'مخالفة أمنية — راجع السجلات.');

/**
 * Sprint A post-launch: unified error envelope.
 *
 * Throw `validationError(code, message, fields)` (or any `AppError`) — the
 * HTTP filter will translate it into the single flat envelope shape
 * `{ statusCode, error, message, fields? }` that all clients should handle.
 */
export function validationError(code: string, message: string, fields: string[] = []): AppError {
  return new AppError(422, code, message, fields);
}
