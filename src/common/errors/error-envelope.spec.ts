import {
  AppError,
  ERRORS,
  accountNotFound,
  contentLocked,
  emailAlreadyExists,
  exceedsPlatformLimit,
  invalidStatusTransition,
  invalidTransition,
  invoiceNotFound,
  notApproved,
  notFound,
  paymentFailed,
  publishNotAllowedHere,
  quotaExceeded,
  rangeTooWide,
  remindAtInPast,
  remindAtRequired,
  reminderAlreadySent,
  validationFailed,
  webhookSignatureInvalid,
} from './error-envelope';

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
        'CONTENT_LOCKED',
        'EMAIL_ALREADY_EXISTS',
        'EXCEEDS_PLATFORM_LIMIT',
        'INVALID_CREDENTIALS',
        'INVALID_REFRESH_TOKEN',
        'INVALID_STATUS_TRANSITION',
        'INVALID_TRANSITION',
        'INVOICE_NOT_FOUND',
        'NOT_APPROVED',
        'NOT_FOUND',
        'PAYMENT_FAILED',
        'PUBLISH_NOT_ALLOWED_HERE',
        'QUOTA_EXCEEDED',
        'RANGE_TOO_WIDE',
        'REMIND_AT_IN_PAST',
        'REMIND_AT_REQUIRED',
        'REMINDER_ALREADY_SENT',
        'TOKEN_EXPIRED',
        'UNAUTHENTICATED',
        'VALIDATION_ERROR',
        'VALIDATION_FAILED',
        'WEBHOOK_SIGNATURE_INVALID',
      ].sort(),
    );
  });

  it('AppError carries status code and exposes a typed envelope', () => {
    const ex = emailAlreadyExists();
    expect(ex).toBeInstanceOf(AppError);
    expect(ex.getStatus()).toBe(409);
    expect(ex.getEnvelope()).toEqual(ERRORS.EMAIL_ALREADY_EXISTS);
  });

  it('accountNotFound is 404 (never 403) to avoid leaking existence', () => {
    expect(accountNotFound().getStatus()).toBe(404);
  });

  describe('Phase 4 error codes', () => {
    it('validationFailed → 400 VALIDATION_FAILED', () => {
      const ex = validationFailed();
      expect(ex.getStatus()).toBe(400);
      expect(ex.getEnvelope()).toEqual(ERRORS.VALIDATION_FAILED);
      expect(ERRORS.VALIDATION_FAILED).toEqual({
        statusCode: 400,
        error: 'VALIDATION_FAILED',
        message: 'تحقّق من صحّة المدخلات.',
      });
    });

    it('rangeTooWide → 400 RANGE_TOO_WIDE', () => {
      const ex = rangeTooWide();
      expect(ex.getStatus()).toBe(400);
      expect(ex.getEnvelope()).toEqual(ERRORS.RANGE_TOO_WIDE);
      expect(ERRORS.RANGE_TOO_WIDE).toEqual({
        statusCode: 400,
        error: 'RANGE_TOO_WIDE',
        message: 'الفترة المطلوبة تتجاوز ٩٢ يوماً.',
      });
    });

    it('invalidTransition → 409 INVALID_TRANSITION', () => {
      const ex = invalidTransition();
      expect(ex.getStatus()).toBe(409);
      expect(ex.getEnvelope()).toEqual(ERRORS.INVALID_TRANSITION);
      expect(ERRORS.INVALID_TRANSITION).toEqual({
        statusCode: 409,
        error: 'INVALID_TRANSITION',
        message: 'انتقال حالة غير مسموح به.',
      });
    });

    it('contentLocked → 409 CONTENT_LOCKED', () => {
      const ex = contentLocked();
      expect(ex.getStatus()).toBe(409);
      expect(ex.getEnvelope()).toEqual(ERRORS.CONTENT_LOCKED);
      expect(ERRORS.CONTENT_LOCKED).toEqual({
        statusCode: 409,
        error: 'CONTENT_LOCKED',
        message: 'لا يمكن تعديل محتوى منشور مُعتمد. اسحبه للمراجعة أولاً.',
      });
    });

    it('notFound → 404 NOT_FOUND', () => {
      const ex = notFound();
      expect(ex.getStatus()).toBe(404);
      expect(ex.getEnvelope()).toEqual(ERRORS.NOT_FOUND);
      expect(ERRORS.NOT_FOUND).toEqual({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'العنصر غير موجود.',
      });
    });

    it('publishNotAllowedHere → 422 PUBLISH_NOT_ALLOWED_HERE', () => {
      const ex = publishNotAllowedHere();
      expect(ex.getStatus()).toBe(422);
      expect(ex.getEnvelope()).toEqual(ERRORS.PUBLISH_NOT_ALLOWED_HERE);
      expect(ERRORS.PUBLISH_NOT_ALLOWED_HERE).toEqual({
        statusCode: 422,
        error: 'PUBLISH_NOT_ALLOWED_HERE',
        message: 'النشر يتم في المرحلة الخامسة، وليس من هنا.',
      });
    });
  });

  describe('Phase 5 error codes', () => {
    it('notApproved → 409 NOT_APPROVED', () => {
      const ex = notApproved();
      expect(ex.getStatus()).toBe(409);
      expect(ex.getEnvelope()).toEqual(ERRORS.NOT_APPROVED);
    });

    it('exceedsPlatformLimit → 422 EXCEEDS_PLATFORM_LIMIT with detail', () => {
      const ex = exceedsPlatformLimit(305, 280);
      expect(ex.getStatus()).toBe(422);
      expect((ex as AppError).code).toBe('EXCEEDS_PLATFORM_LIMIT');
      expect(ex.getEnvelope().message).toContain('305');
      expect(ex.getEnvelope().message).toContain('280');
    });

    it('invalidStatusTransition → 409 with current status surfaced', () => {
      const ex = invalidStatusTransition('draft');
      expect(ex.getStatus()).toBe(409);
      expect((ex as AppError).code).toBe('INVALID_STATUS_TRANSITION');
      expect(ex.getEnvelope().message).toContain('draft');
    });

    it('remindAtRequired → 422 REMIND_AT_REQUIRED', () => {
      const ex = remindAtRequired();
      expect(ex.getStatus()).toBe(422);
      expect(ex.getEnvelope()).toEqual(ERRORS.REMIND_AT_REQUIRED);
    });

    it('remindAtInPast → 422 REMIND_AT_IN_PAST', () => {
      const ex = remindAtInPast();
      expect(ex.getStatus()).toBe(422);
      expect(ex.getEnvelope()).toEqual(ERRORS.REMIND_AT_IN_PAST);
    });

    it('reminderAlreadySent → 409 REMINDER_ALREADY_SENT', () => {
      const ex = reminderAlreadySent();
      expect(ex.getStatus()).toBe(409);
      expect(ex.getEnvelope()).toEqual(ERRORS.REMINDER_ALREADY_SENT);
    });
  });

  describe('Phase 6 billing error codes', () => {
    it('quotaExceeded returns Arabic reason and 402', () => {
      const e = quotaExceeded('text', 60, 60);
      expect(e.getStatus()).toBe(402);
      expect(e.getEnvelope().error).toBe('QUOTA_EXCEEDED');
      expect(e.getEnvelope().message).toContain('المسودّات');
      expect(e.getEnvelope().message).toContain('60');
    });

    it('paymentFailed returns 402', () => {
      expect(paymentFailed('declined').getStatus()).toBe(402);
    });

    it('webhookSignatureInvalid returns 401', () => {
      expect(webhookSignatureInvalid().getStatus()).toBe(401);
    });

    it('invoiceNotFound returns 404', () => {
      expect(invoiceNotFound().getStatus()).toBe(404);
    });
  });
});
