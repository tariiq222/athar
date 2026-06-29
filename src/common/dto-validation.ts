import { UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';

export interface ErrorEnvelope {
  error: { code: string; message: string; fields: string[] };
}

export function errorEnvelope(code: string, message: string, fields: string[] = []): ErrorEnvelope {
  return { error: { code, message, fields } };
}

export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const fields = errors.map((e) => e.property);
      return new UnprocessableEntityException(
        errorEnvelope('validation_error', 'بيانات غير صالحة', fields),
      );
    },
  });
}
