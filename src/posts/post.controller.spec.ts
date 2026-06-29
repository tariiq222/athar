import { Test } from '@nestjs/testing';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { JwtAuthGuard } from '../tenant/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';

describe('PostController', () => {
  it('GET /posts passes tenantId from context and parsed query to the service', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const moduleRef = await Test.createTestingModule({
      controllers: [PostController],
      providers: [{ provide: PostService, useValue: { list } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const ctrl = moduleRef.get(PostController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const query = { status: 'draft', page: 2, pageSize: 50 } as any;
    const res = await ctrl.list(ctx as any, query);

    expect(list).toHaveBeenCalledWith('t1', query);
    expect(res).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it('PATCH /posts/:id passes tenantId, id, and parsed body to the service', async () => {
    const patch = jest.fn().mockResolvedValue({ id: 'p1' });
    const moduleRef = await Test.createTestingModule({
      controllers: [PostController],
      providers: [{ provide: PostService, useValue: { patch } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const ctrl = moduleRef.get(PostController);

    const ctx = { userId: 'u1', tenantId: 't1' };
    const body = { text: 'new text' } as any;
    const res = await ctrl.patch(ctx as any, 'p1', body);

    expect(patch).toHaveBeenCalledWith('t1', 'p1', body);
    expect(res).toEqual({ id: 'p1' });
  });
});
