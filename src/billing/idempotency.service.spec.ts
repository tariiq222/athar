import { IdempotencyService } from './idempotency.service';

type Row = Record<string, any>;

function makePrisma() {
  const events: Row[] = [];
  return {
    events,
    webhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        if (events.find((e) => e.id === data.id)) {
          const err: any = new Error('unique violation');
          err.code = 'P2002';
          throw err;
        }
        const row = { id: data.id, processedAt: null, ...data };
        events.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = events.find((e) => e.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
  } as any;
}

describe('IdempotencyService', () => {
  it('claim returns true the first time the event id is seen', async () => {
    const prisma = makePrisma();
    const svc = new IdempotencyService(prisma);
    const first = await svc.claim('evt_1', 'payment_paid', 't1', { foo: 1 });
    expect(first).toBe(true);
    expect(prisma.events).toHaveLength(1);
    expect(prisma.events[0].id).toBe('evt_1');
    expect(prisma.events[0].type).toBe('payment_paid');
    expect(prisma.events[0].tenantId).toBe('t1');
    expect(prisma.events[0].payload).toEqual({ foo: 1 });
  });

  it('claim returns false on a duplicate event id (P2002 swallowed)', async () => {
    const prisma = makePrisma();
    const svc = new IdempotencyService(prisma);
    await svc.claim('evt_1', 'payment_paid', 't1', { foo: 1 });
    const second = await svc.claim('evt_1', 'payment_paid', 't1', { foo: 2 });
    expect(second).toBe(false);
    // Original row untouched
    expect(prisma.events).toHaveLength(1);
    expect(prisma.events[0].payload).toEqual({ foo: 1 });
  });

  it('claim accepts a null tenantId for tenant-less events', async () => {
    const prisma = makePrisma();
    const svc = new IdempotencyService(prisma);
    const ok = await svc.claim('evt_x', 'system_event', null, {});
    expect(ok).toBe(true);
    expect(prisma.events[0].tenantId).toBeNull();
  });

  it('markProcessed stamps processedAt on the event row', async () => {
    const prisma = makePrisma();
    const svc = new IdempotencyService(prisma);
    await svc.claim('evt_1', 'payment_paid', 't1', {});
    await svc.markProcessed('evt_1');
    expect(prisma.events[0].processedAt).toBeInstanceOf(Date);
  });

  it('rethrows non-P2002 errors so we do not mask real failures', async () => {
    const prisma = {
      webhookEvent: {
        create: jest.fn(async () => {
          throw new Error('connection refused');
        }),
      },
    } as any;
    const svc = new IdempotencyService(prisma);
    await expect(svc.claim('evt_1', 'payment_paid', 't1', {})).rejects.toThrow(/connection refused/);
  });
});