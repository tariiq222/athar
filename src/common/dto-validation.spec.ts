import { errorEnvelope, buildValidationPipe } from './dto-validation';
import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

describe('dto-validation', () => {
  it('errorEnvelope shapes a consistent body', () => {
    expect(errorEnvelope('consent_required', 'تتطلّب الموافقة', ['consentAccepted'])).toEqual({
      error: { code: 'consent_required', message: 'تتطلّب الموافقة', fields: ['consentAccepted'] },
    });
  });

  it('errorEnvelope omits fields when not provided', () => {
    expect(errorEnvelope('not_found', 'غير موجود')).toEqual({
      error: { code: 'not_found', message: 'غير موجود', fields: [] },
    });
  });

  it('buildValidationPipe returns a ValidationPipe whose factory throws 422 with fields', () => {
    const pipe = buildValidationPipe();
    expect(pipe).toBeInstanceOf(ValidationPipe);
    const factory = (pipe as any).exceptionFactory as (errors: any[]) => any;
    const err = factory([{ property: 'websiteUrl', constraints: { isUrl: 'bad' } }]);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.getResponse()).toEqual({
      error: { code: 'validation_error', message: expect.any(String), fields: ['websiteUrl'] },
    });
  });
});