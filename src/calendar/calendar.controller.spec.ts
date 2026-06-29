import { Test } from '@nestjs/testing';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';

describe('CalendarController', () => {
  it('GET /calendar rejects ranges over 92 days with RANGE_TOO_WIDE (400)', async () => {
    const get = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [{ provide: CalendarService, useValue: { get } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const ctrl = moduleRef.get(CalendarController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const query = { from: '2026-01-01', to: '2026-06-01' } as any; // ~152 days

    const err = await ctrl.get(ctx as any, query).catch((e) => e);
    expect(err).toMatchObject({ code: 'RANGE_TOO_WIDE' });
    expect(err.getStatus()).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('GET /calendar returns { entries: [...] } for an in-range query', async () => {
    const get = jest.fn().mockResolvedValue([{ type: 'occasion', date: '2026-09-23' }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [{ provide: CalendarService, useValue: { get } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const ctrl = moduleRef.get(CalendarController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const query = { from: '2026-09-01', to: '2026-09-30' } as any;
    const res = await ctrl.get(ctx as any, query);

    expect(get).toHaveBeenCalledWith('t1', query);
    expect(res).toEqual({ entries: [{ type: 'occasion', date: '2026-09-23' }] });
  });
});
