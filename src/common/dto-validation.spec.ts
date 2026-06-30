import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { buildValidationPipe } from './dto-validation';

describe('dto-validation', () => {
  it('buildValidationPipe returns a ValidationPipe whose factory throws 422 with fields', () => {
    const pipe = buildValidationPipe();
    expect(pipe).toBeInstanceOf(ValidationPipe);
    const factory = (pipe as unknown as { exceptionFactory: (errors: unknown[]) => unknown })
      .exceptionFactory;
    const err = factory([{ property: 'websiteUrl', constraints: { isUrl: 'bad' } }]);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toEqual({
      error: { code: 'validation_error', message: expect.any(String), fields: ['websiteUrl'] },
    });
  });
});
