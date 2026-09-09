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
import { AuthModule } from '@/modules/auth/auth.module';
import { SystemModule } from '@/modules/system/system.module';
import { EquipmentModule } from '@/modules/equipment/equipment.module';
import { InquiryModule } from '@/modules/inquiry/inquiry.module';
import { CustomerModule } from '@/modules/customer/customer.module';
import { B2cModule } from '@/modules/b2c/b2c.module';
import { PrismaModule, SoftDeleteModule, RedisModule, ResponseInterceptor, HttpExceptionFilter, OperationLogInterceptor, FeatureFlagGuard, LoggingModule, RequestLogInterceptor } from '@gvray/core';


import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { OperationLogsModule } from '@/modules/system/operation-logs/operation-logs.module';
import appConfig from '@/config/app.config';
import databaseConfig from '@/config/database.config';
import jwtConfig from '@/config/jwt.config';
import corsConfig from '@/config/cors.config';
import redisConfig from '@/config/redis.config';
import { validate } from '@/config/env.validation';




// import { SessionHeartbeatInterceptor } from '@gvray/core'; // 依赖 @/modules/auth/token.service，暂未纳入 barrel




@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
      load: [appConfig, databaseConfig, jwtConfig, corsConfig, redisConfig],
      validate,
      expandVariables: true,
      cache: true,
      ignoreEnvFile: false,
    }),
    // 全局默认限流：1000 req/min per-IP（单机内存 store 过渡版，多实例下生效配额为 N×1000）
    // 公开接口（@Public + @Throttle）进一步收紧到 60 req/min
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 1000, ttl: 60000 }],
    }),
    PrismaModule,
    SoftDeleteModule,
    RedisModule,
    AuthModule,
    SystemModule,
    EquipmentModule,
    InquiryModule,
    CustomerModule,
    B2cModule,
    DashboardModule,
    ProfileModule,
    OperationLogsModule,
    DiscoveryModule,
    // 深日志模块：接入 pino（prod JSON / dev pretty）、全局请求关联 ID 中间件
    LoggingModule,
  ],
  providers: [
    AppService,
    {
      // 最外层请求日志拦截器：包裹 ResponseInterceptor / OperationLogInterceptor，
      // 度量完整调用链耗时并捕捉所有异常，失败只记一次
      provide: APP_INTERCEPTOR,
      useClass: RequestLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: SessionHeartbeatInterceptor,
    // },
    {
      provide: APP_INTERCEPTOR,
      useClass: OperationLogInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureFlagGuard,
    },
    // ThrottlerGuard 作为第二个全局 APP_GUARD，与 FeatureFlagGuard 并列
    // （NestJS 允许多个 APP_GUARD，按 provider 注册顺序执行）
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    Reflector,
  ],
})
export class AppModule {}
