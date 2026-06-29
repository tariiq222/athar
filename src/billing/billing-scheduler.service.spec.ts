import { BillingSchedulerService } from './billing-scheduler.service';

describe('BillingSchedulerService', () => {
  it('onModuleInit enqueues a daily repeatable trial-expiry job', async () => {
    const add = jest.fn().mockResolvedValue({});
    const queue = { add } as any;
    const svc = new BillingSchedulerService(queue);
    await svc.onModuleInit();
    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0];
    expect(name).toBe('trial-expiry-daily');
    expect(data).toEqual({});
    expect(opts.repeat).toEqual({ pattern: '0 0 * * *' });
    // Fixed jobId prevents double-insertion on BullMQ restarts.
    expect(opts.jobId).toBe('trial-expiry:daily');
    expect(opts.removeOnComplete).toBe(100);
    expect(opts.removeOnFail).toBe(100);
  });
});
