import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

/**
 * Logger-only filter for BullMQ workers — Sprint A Task 9.1.
 *
 * Workers run in a non-HOST transport (`rpc`): there is no response to
 * write to. We log the failure with enough context to debug, then
 * RE-THROW so BullMQ can mark the job as failed and apply its retry
 * / dead-letter semantics.
 *
 * No envelope here — that contract belongs to `HttpExceptionFilter`.
 */
@Catch()
export class BullmqExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BullmqExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    this.logger.error(
      { err: exception, hostType: host.getType() },
      'worker exception — rethrown so BullMQ marks the job failed',
    );
    throw exception;
  }
}
