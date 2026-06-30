import { Test } from '@nestjs/testing';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';

const ctx = { userId: 'u1', tenantId: 't1' };

async function buildCtrl(overrides: { list?: jest.Mock; patch?: jest.Mock }) {
  const list =
    overrides.list ?? jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  const patch = overrides.patch ?? jest.fn().mockResolvedValue({ id: 'p1' });
  const moduleRef = await Test.createTestingModule({
    controllers: [PostController],
    providers: [{ provide: PostService, useValue: { list, patch } }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(TenantGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return { ctrl: moduleRef.get(PostController), list, patch };
}

describe('PostController', () => {
  // ── GET /posts ─────────────────────────────────────────────────────────────

  it('GET /posts passes tenantId from context and parsed query to the service', async () => {
    const { ctrl, list } = await buildCtrl({});
    const query = { status: 'draft', page: 2, pageSize: 50 } as any;
    const res = await ctrl.list(ctx as any, query);
    expect(list).toHaveBeenCalledWith('t1', query);
    expect(res).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it('GET /posts with no query params passes empty object to service', async () => {
    const { ctrl, list } = await buildCtrl({});
    await ctrl.list(ctx as any, {} as any);
    expect(list).toHaveBeenCalledWith('t1', {});
  });

  it('GET /posts returns the service result verbatim', async () => {
    const mockResult = { items: [{ id: 'x' }], page: 2, pageSize: 10, total: 55 };
    const list = jest.fn().mockResolvedValue(mockResult);
    const { ctrl } = await buildCtrl({ list });
    const out = await ctrl.list(ctx as any, {} as any);
    expect(out).toBe(mockResult);
  });

  it('GET /posts uses tenantId from the context, not a hardcoded value', async () => {
    const { ctrl, list } = await buildCtrl({});
    const otherCtx = { userId: 'u2', tenantId: 't99' };
    await ctrl.list(otherCtx as any, {} as any);
    expect(list).toHaveBeenCalledWith('t99', {});
  });

  it('GET /posts propagates service errors to the caller', async () => {
    const err = new Error('DB_ERROR');
    const list = jest.fn().mockRejectedValue(err);
    const { ctrl } = await buildCtrl({ list });
    await expect(ctrl.list(ctx as any, {} as any)).rejects.toThrow('DB_ERROR');
  });

  // ── PATCH /posts/:id ──────────────────────────────────────────────────────

  it('PATCH /posts/:id passes tenantId, id, and parsed body to the service', async () => {
    const { ctrl, patch } = await buildCtrl({});
    const body = { text: 'new text' } as any;
    const res = await ctrl.patch(ctx as any, 'p1', body);
    expect(patch).toHaveBeenCalledWith('t1', 'p1', body);
    expect(res).toEqual({ id: 'p1' });
  });

  it('PATCH /posts/:id passes the param id, not any body id field', async () => {
    const { ctrl, patch } = await buildCtrl({});
    await ctrl.patch(ctx as any, 'param-id', { text: 'x' } as any);
    const [, passedId] = patch.mock.calls[0];
    expect(passedId).toBe('param-id');
  });

  it('PATCH /posts/:id returns the PostDetail from the service', async () => {
    const detail = {
      id: 'p1',
      tenantId: 't1',
      brandProfileId: 'b1',
      platform: 'x',
      status: 'draft',
      text: 'updated',
      hashtags: [],
      scheduledAt: null,
      createdAt: '2026-09-23T00:00:00.000Z',
      image: null,
      citations: [],
    };
    const patch = jest.fn().mockResolvedValue(detail);
    const { ctrl } = await buildCtrl({ patch });
    const out = await ctrl.patch(ctx as any, 'p1', { text: 'updated' } as any);
    expect(out).toBe(detail);
  });

  it('PATCH /posts/:id uses tenantId from the context', async () => {
    const { ctrl, patch } = await buildCtrl({});
    const otherCtx = { userId: 'u9', tenantId: 'tenant-X' };
    await ctrl.patch(otherCtx as any, 'post-99', {} as any);
    expect(patch).toHaveBeenCalledWith('tenant-X', 'post-99', {});
  });

  it('PATCH /posts/:id propagates service errors to the caller', async () => {
    const err = new Error('NOT_FOUND');
    const patch = jest.fn().mockRejectedValue(err);
    const { ctrl } = await buildCtrl({ patch });
    await expect(ctrl.patch(ctx as any, 'ghost', {} as any)).rejects.toThrow('NOT_FOUND');
  });
});
