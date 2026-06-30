import { ValidationPipe } from '@nestjs/common';
import { buildValidationPipe } from './dto-validation';
import { AppError } from './errors/error-envelope';

describe('dto-validation', () => {
  it('buildValidationPipe returns a ValidationPipe whose factory throws 422 with fields', () => {
    const pipe = buildValidationPipe();
    expect(pipe).toBeInstanceOf(ValidationPipe);
    const factory = (pipe as unknown as { exceptionFactory: (errors: unknown[]) => unknown })
      .exceptionFactory;
    const err = factory([{ property: 'websiteUrl', constraints: { isUrl: 'bad' } }]);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getEnvelope()).toEqual({
      statusCode: 422,
      error: 'validation_error',
      message: expect.any(String),
      fields: ['websiteUrl'],
    });
    expect((err as AppError).getStatus()).toBe(422);
  });
});
