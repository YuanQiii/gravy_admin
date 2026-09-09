import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  APP_INTERCEPTOR,
  APP_FILTER,
  APP_GUARD,
  Reflector,
  DiscoveryModule,
} from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MallModule } from '@/modules/mall/mall.module';
import { CustomerAuthModule } from '@/modules/customer-auth/customer-auth.module';
import { CustomerActivityModule } from '@/modules/customer-activity/customer-activity.module';
import {
  PrismaModule,
  RedisModule,
  SoftDeleteModule,
  LoggingModule,
  ResponseInterceptor,
  HttpExceptionFilter,
  RequestLogInterceptor,
  appConfig,
  databaseConfig,
  jwtConfig,
  corsConfig,
  redisConfig,
  validateEnv,
} from '@gvray/core';

/**
 * GVRAY Mall（B2C 商城）应用根模块。
 *
 * 仅承载 mall 自域模块与共享基础设施，**不**包含后台关注点：
 * 不注册 OperationLogInterceptor / FeatureFlagGuard / PermissionsGuard
 * （B2C 浏览接口自行用 @Throttle 收敛到 60 req/min）。
 */
@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `apps/mall/.env.${process.env.NODE_ENV}`,
        'apps/mall/.env',
      ],
      load: [appConfig, databaseConfig, jwtConfig, corsConfig, redisConfig],
      validate: validateEnv,
      expandVariables: true,
      cache: true,
      ignoreEnvFile: false,
    }),
    // 全局默认限流：1000 req/min per-IP（单机内存 store 过渡版）
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 1000, ttl: 60000 }],
    }),
    PrismaModule,
    RedisModule,
    SoftDeleteModule,
    MallModule,
    CustomerAuthModule,
    CustomerActivityModule,
    DiscoveryModule,
    // 深日志模块：接入 pino（prod JSON / dev pretty）、全局请求关联 ID 中间件
    LoggingModule,
  ],
  providers: [
    AppService,
    {
      // 最外层请求日志拦截器：统一访问日志（成功 info / 慢附 body / 失败 error）
      provide: APP_INTERCEPTOR,
      useClass: RequestLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    Reflector,
  ],
})
export class MallAppModule {}