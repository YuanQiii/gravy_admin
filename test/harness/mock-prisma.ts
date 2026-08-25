import { PrismaService } from '../../src/prisma/prisma.service';

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

  const prisma = new Proxy(root as unknown as PrismaService, {
    get(target: Record<string | symbol, unknown>, prop: string | symbol) {
      if (prop in target) {
        return target[prop];
      }
      if (typeof prop !== 'string') {
        return undefined;
      }
      // 懒创建模型代理：model 下的每个方法都是独立的 jest.fn()
      const model = new Proxy({} as Record<string, jest.Mock>, {
        get(modelTarget, method: string | symbol) {
          if (typeof method !== 'string') return undefined;
          if (!(method in modelTarget)) {
            modelTarget[method] = jest.fn();
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
