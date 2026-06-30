import { ArgumentsHost } from '@nestjs/common';
import { BullmqExceptionFilter } from './bullmq-exception.filter';

function mockRpcHost(): ArgumentsHost {
  return {
    getType: () => 'rpc',
    switchToHttp: () => {
      throw new Error('switchToHttp should not be called on an rpc host');
    },
  } as unknown as ArgumentsHost;
}

describe('BullmqExceptionFilter', () => {
  const filter = new BullmqExceptionFilter();

  it('re-throws the original exception on an rpc host', () => {
    const host = mockRpcHost();
    const original = new Error('worker boom');
    expect(() => filter.catch(original, host)).toThrow(original);
  });

  it('re-throws even when host.getType() returns something other than "rpc"', () => {
    const host = {
      getType: () => 'ws',
      switchToHttp: () => {
        throw new Error('switchToHttp should not be called');
      },
    } as unknown as ArgumentsHost;
    const original = new Error('ws boom');
    expect(() => filter.catch(original, host)).toThrow(original);
  });
});
