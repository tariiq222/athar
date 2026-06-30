import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import {
  emailAlreadyExists,
  securityViolation,
  unauthenticated,
  validationFailed,
} from '../errors/error-envelope';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function mockHttpHost(): { host: ArgumentsHost; res: MockResponse } {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const req = { url: '/api/v1/test' } as unknown as Request;
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => ({ status, json }),
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;
  return { host, res: { status, json } };
}

function mockRpcHost(exception: unknown): ArgumentsHost {
  const host = {
    getType: () => 'rpc',
    switchToHttp: () => {
      throw new Error('switchToHttp should not be called on a non-HTTP host');
    },
  } as unknown as ArgumentsHost;
  // attach exception so test can assert re-throw
  (host as unknown as { __exception: unknown }).__exception = exception;
  return host;
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('returns 401 with UNAUTHENTICATED envelope for unauthenticated()', () => {
    const { host, res } = mockHttpHost();
    filter.catch(unauthenticated(), host);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 401,
      error: 'UNAUTHENTICATED',
      message: 'يلزم تسجيل الدخول.',
    });
  });

  it('returns 409 EMAIL_ALREADY_EXISTS envelope for emailAlreadyExists()', () => {
    const { host, res } = mockHttpHost();
    filter.catch(emailAlreadyExists(), host);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'EMAIL_ALREADY_EXISTS',
      message: 'هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.',
    });
  });

  it('returns 403 envelope for securityViolation()', () => {
    const { host, res } = mockHttpHost();
    filter.catch(securityViolation('TENANT_MISMATCH'), host);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'TENANT_MISMATCH',
      message: 'مخالفة أمنية — راجع السجلات.',
    });
  });

  it('maps validationFailed() (AppError 400) to its envelope', () => {
    const { host, res } = mockHttpHost();
    filter.catch(validationFailed(), host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'VALIDATION_FAILED',
      message: 'تحقّق من صحّة المدخلات.',
    });
  });

  it('maps a generic HttpException (NotFound) to its status with HTTP_ERROR', () => {
    const { host, res } = mockHttpHost();
    filter.catch(new NotFoundException('nope'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'HTTP_ERROR',
      message: 'nope',
    });
  });

  it('maps a BadRequestException array message to 422 VALIDATION_ERROR', () => {
    const { host, res } = mockHttpHost();
    filter.catch(new BadRequestException(['email must be an email']), host);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
      message: 'email must be an email',
    });
  });

  it('maps an unknown error to 500 INTERNAL_ERROR', () => {
    const { host, res } = mockHttpHost();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقّع.',
    });
  });

  it('does not write an envelope and re-throws on a non-HTTP (rpc) host', () => {
    const original = new Error('worker boom');
    const host = mockRpcHost(original);
    expect(() => filter.catch(original, host)).toThrow(original);
  });
});
