import { ValidationError, ValidationPipe } from '@nestjs/common';
import { validationError } from './errors/error-envelope';

/**
 * Sprint A — Task 9.1: this file owns the *factory* for the global
 * ValidationPipe. The error-envelope vocabulary (validation error body
 * shape, flat envelope, AppError helpers) now lives in
 * `src/common/errors/error-envelope.ts` — the single source of truth.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const fields = errors.map((e) => e.property);
      return validationError('validation_error', 'بيانات غير صالحة', fields);
    },
  });
}
