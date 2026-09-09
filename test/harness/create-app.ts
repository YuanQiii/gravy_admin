import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService, RedisService, configureApp } from '@gvray/core';
import { AdminAppModule } from '../../apps/admin/src/app.module';
import { MallAppModule } from '../../apps/mall/src/app.module';
import { createMockPrismaService } from './mock-prisma';
import { createInMemoryRedisService } from './mock-redis';

export interface TestHarness {
  app: INestApplication;
  module: TestingModule;
  prisma: PrismaService;
  redis: ReturnType<typeof createInMemoryRedisService>;
}

/**
 * 创建 Admin 应用的 e2e 测试 harness。
 *
 * 默认用内存 mock 替换 PrismaService 和 RedisService，
 * 测试无需真实 PostgreSQL / Redis 即可启动完整 AdminAppModule。
 * 使用 @gvray/core 的 configureApp 进行全局配置（与生产一致）。
 */
export async function createAdminTestApp(): Promise<TestHarness> {
  const prisma = createMockPrismaService();
  const redis = createInMemoryRedisService();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AdminAppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisService)
    .useValue(redis)
    .compile();

  const app = moduleFixture.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  return { app, module: moduleFixture, prisma, redis };
}

/**
 * 创建 Mall 应用的 e2e 测试 harness。
 *
 * 默认用内存 mock 替换 PrismaService 和 RedisService，
 * 测试无需真实 PostgreSQL / Redis 即可启动完整 MallAppModule。
 * 使用 @gvray/core 的 configureApp 进行全局配置（与生产一致）。
 */
export async function createMallTestApp(): Promise<TestHarness> {
  const prisma = createMockPrismaService();
  const redis = createInMemoryRedisService();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [MallAppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisService)
    .useValue(redis)
    .compile();

  const app = moduleFixture.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  return { app, module: moduleFixture, prisma, redis };
}
