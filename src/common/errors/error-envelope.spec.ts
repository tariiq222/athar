import {
  AppError,
  ERRORS,
  accountNotFound,
  contentLocked,
  emailAlreadyExists,
  invalidTransition,
  notFound,
  publishNotAllowedHere,
  rangeTooWide,
  validationFailed,
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
        'INVALID_CREDENTIALS',
        'INVALID_REFRESH_TOKEN',
        'INVALID_TRANSITION',
        'NOT_FOUND',
        'PUBLISH_NOT_ALLOWED_HERE',
        'RANGE_TOO_WIDE',
        'TOKEN_EXPIRED',
        'UNAUTHENTICATED',
        'VALIDATION_ERROR',
        'VALIDATION_FAILED',
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
});