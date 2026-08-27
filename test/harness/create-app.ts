import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { EmptyStringTransformPipe } from '../../src/core/pipes/empty-string-transform.pipe';
import { createMockPrismaService } from './mock-prisma';
import { createInMemoryRedisService } from './mock-redis';

export interface TestHarness {
  app: INestApplication;
  module: TestingModule;
  prisma: PrismaService;
  redis: ReturnType<typeof createInMemoryRedisService>;
}

/**
 * e2e 测试应用工厂。
 *
 * 默认用内存 mock 替换 PrismaService 和 RedisService，
 * 测试无需真实 PostgreSQL / Redis 即可启动完整 AppModule。
 * 全局管道与 main.ts 保持一致（EmptyStringTransformPipe + ValidationPipe）。
 *
 * 用法：
 *   const { app, prisma } = await createTestApp();
 *   jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(...);
 *   await request(app.getHttpServer()).get('/').expect(200);
 *   await app.close();
 */
export async function createTestApp(): Promise<TestHarness> {
  const prisma = createMockPrismaService();
  const redis = createInMemoryRedisService();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisService)
    .useValue(redis)
    .compile();

  const app = moduleFixture.createNestApplication({ logger: false });

  // 与 main.ts 一致：先转换空字符串，再进行验证
  app.useGlobalPipes(
    new EmptyStringTransformPipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();

  return { app, module: moduleFixture, prisma, redis };
}
