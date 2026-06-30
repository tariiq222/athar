import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AppError, ErrorEnvelope } from '../errors/error-envelope';

type StatusJsonResponse = {
  status(code: number): { json(body: unknown): unknown };
};

/**
 * HTTP exception filter — Sprint A Task 9.1.
 *
 * Maps any exception thrown inside an HTTP route to the unified envelope
 * (`{ statusCode, error, message }`) defined in `error-envelope.ts`.
 *
 * On a non-HTTP host (e.g. a BullMQ worker running in the same NestJS
 * process) we MUST NOT touch `switchToHttp()`; instead we log + re-throw
 * so the queue runtime can mark the job as failed. The dedicated
 * `BullmqExceptionFilter` handles that path explicitly when wired.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error(
        { err: exception, hostType: host.getType() },
        'non-http exception reached HTTP filter',
      );
      throw exception;
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<StatusJsonResponse>();
    const req = ctx.getRequest<Request>();
    const envelope = this.toEnvelope(exception);

    res.status(envelope.statusCode).json(envelope);
    if (envelope.statusCode >= 500) {
      this.logger.error(
        { err: exception, path: req.url },
        `${envelope.statusCode} response (${envelope.error})`,
      );
    }
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppError) {
      return exception.getEnvelope();
    }

    if (exception instanceof BadRequestException) {
      // class-validator failures from the global ValidationPipe surface as
      // BadRequest (400); we re-shape to 422 with the unified envelope so
      // the API surface is consistent regardless of throw site.
      return {
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: this.firstValidationMessage(exception),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        error: 'HTTP_ERROR',
        message: exception.message,
      };
    }

    return {
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقّع.',
    };
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
