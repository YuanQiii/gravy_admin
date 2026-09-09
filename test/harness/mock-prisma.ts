import { PrismaService } from '@gvray/core';

/**
 * PrismaService 深度 mock 工厂。
 *
 * 通过 Proxy 懒创建模型代理（如 prisma.user.findUnique），
 * 任意 model.method 访问都会自动生成 jest.fn()，无需预先声明模型列表。
 *
 * 用法：
 *   const prisma = createMockPrismaService();
 *   jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(...);
 */
export function createMockPrismaService(): PrismaService {
  const root: Record<string | symbol, unknown> = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    // 支持数组形式与回调形式：$transaction([tx...]) / $transaction((tx) => ...)
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => unknown)(prisma);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return undefined;
    }),
  };

  // 已知的只读 Prisma 方法及其在 mock 下应返回的"空"语义默认值。
  // 测试可通过 mockResolvedValue 显式覆盖这些默认值。
  // 作用：在 app.init() 触发的 bootstrap 扫描（如 PermissionsScannerService）
  // 中避免 findMany 返回 undefined 导致 Array.prototype.find 抛错。
  const READ_DEFAULTS: Record<string, unknown> = {
    findMany: [],
    findUnique: null,
    findFirst: null,
    findUniqueOrThrow: null,
    findFirstOrThrow: null,
    count: 0,
    aggregate: {},
    groupBy: [],
    createManyAndReturn: [],
  };

  const prisma = new Proxy(root as unknown as PrismaService, {
    get(target: any, prop: string | symbol) {
      if (prop in target) {
        return target[prop];
      }
      if (typeof prop !== 'string') {
        return undefined;
      }
      // 懒创建模型代理：model 下的每个方法都是独立的 jest.fn()，
      // 已知的只读方法默认返回空集合/null/0，避免 bootstrap 扫描中抛 TypeError
      const model = new Proxy({} as Record<string, jest.Mock>, {
        get(modelTarget: any, method: string | symbol) {
          if (typeof method !== 'string') return undefined;
          if (!(method in modelTarget)) {
            const defaultValue = READ_DEFAULTS[method];
            modelTarget[method] =
              defaultValue !== undefined
                ? jest.fn().mockResolvedValue(defaultValue)
                : jest.fn();
          }
          return modelTarget[method];
        },
      });
      target[prop] = model;
      return model;
    },
  });

  return prisma;
}
