import { PrismaService } from './prisma.service';

// Models that carry tenantId and must always be scoped.
const SCOPED_MODELS = new Set([
  'AccountProfile',
  'Post',
  'BrandProfile',
  'User',
  'Subscription',
  'UsageRecord',
]);

const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
]);

const CREATE_OPS = new Set(['create']);

export function forTenant(prisma: PrismaService, tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          if (!SCOPED_MODELS.has(model)) return query(args);

          if (WHERE_OPS.has(operation)) {
            args.where = { ...(args.where ?? {}), tenantId };
          } else if (CREATE_OPS.has(operation)) {
            args.data = { ...(args.data ?? {}), tenantId };
          }
          return query(args);
        },
      },
    },
  });
}
