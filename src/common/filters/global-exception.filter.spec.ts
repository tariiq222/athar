import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { emailAlreadyExists } from '../errors/error-envelope';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('maps AppException to its envelope and status', () => {
    const { host, status, json } = mockHost();
    filter.catch(emailAlreadyExists(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'EMAIL_ALREADY_EXISTS',
      message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
    });
  });

  it('maps validation BadRequestException to VALIDATION_ERROR at 422', () => {
    const { host, status, json } = mockHost();
    filter.catch(new BadRequestException(['email must be an email']), host);
    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
      message: 'email must be an email',
    });
  });

  it('maps a generic HttpException to an envelope at its status', () => {
    const { host, status, json } = mockHost();
    filter.catch(new NotFoundException('nope'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, error: 'HTTP_ERROR', message: 'nope' });
  });

  it('maps an unknown error to 500 INTERNAL_ERROR', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقّع.',
    });
  });
});
