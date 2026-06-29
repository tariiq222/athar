import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AppException, ErrorEnvelope } from '../errors/error-envelope';

type StatusJsonResponse = {
  status(code: number): { json(body: unknown): unknown };
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<StatusJsonResponse>();
    const envelope = this.toEnvelope(exception);
    res.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppException) {
      return exception.getEnvelope();
    }

    if (exception instanceof BadRequestException) {
      // class-validator failures surface here as BadRequest (400).
      const message = this.firstValidationMessage(exception);
      return { statusCode: 422, error: 'VALIDATION_ERROR', message };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { statusCode: status, error: 'HTTP_ERROR', message: exception.message };
    }

    return { statusCode: 500, error: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقّع.' };
  }

  private firstValidationMessage(exception: BadRequestException): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const msg = (response as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg[0] ?? 'تحقّق من صحّة المدخلات.';
      if (typeof msg === 'string') return msg;
    }
    return 'تحقّق من صحّة المدخلات.';
  }
}
