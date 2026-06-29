import { forTenant } from './tenant-scope.extension';

// Minimal fake mimicking the $extends query hook contract.
function makeFakePrisma(capture: { args: any; model?: string; operation?: string }) {
  return {
    $extends: (ext: any) => {
      const queryHook = ext.query.$allModels.$allOperations;
      return {
        accountProfile: {
          findMany: (args: any) =>
            queryHook({
              model: 'AccountProfile',
              operation: 'findMany',
              args,
              query: (finalArgs: any) => {
                capture.args = finalArgs;
                capture.model = 'AccountProfile';
                capture.operation = 'findMany';
                return finalArgs;
              },
            }),
          create: (args: any) =>
            queryHook({
              model: 'AccountProfile',
              operation: 'create',
              args,
              query: (finalArgs: any) => {
                capture.args = finalArgs;
                return finalArgs;
              },
            }),
        },
      };
    },
  };
}

describe('tenant-scope extension', () => {
  it('forces tenantId into the where clause of a read', async () => {
    const capture: any = {};
    const scoped = forTenant(makeFakePrisma(capture) as any, 'tenant-1');
    await scoped.accountProfile.findMany({ where: { handle: 'x' } });
    expect(capture.args.where).toEqual({ handle: 'x', tenantId: 'tenant-1' });
  });

  it('overwrites a forged tenantId in the where clause', async () => {
    const capture: any = {};
    const scoped = forTenant(makeFakePrisma(capture) as any, 'tenant-1');
    await scoped.accountProfile.findMany({ where: { tenantId: 'tenant-EVIL' } });
    expect(capture.args.where.tenantId).toBe('tenant-1');
  });

  it('forces tenantId into create data', async () => {
    const capture: any = {};
    const scoped = forTenant(makeFakePrisma(capture) as any, 'tenant-1');
    // Cast to `any` because the test focuses on the extension's behavior,
    // not the full shape of AccountProfileCreateInput (which requires a
    // brandProfile relation in the generated Prisma types).
    await (scoped.accountProfile as any).create({ data: { platform: 'x', tenantId: 'tenant-EVIL' } });
    expect(capture.args.data.tenantId).toBe('tenant-1');
  });
});
