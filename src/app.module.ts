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
import { PrismaModule } from '@/prisma/prisma.module';
import { SoftDeleteModule } from '@/shared/services/soft-delete.module';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { OperationLogsModule } from '@/modules/system/operation-logs/operation-logs.module';
import appConfig from '@/config/app.config';
import databaseConfig from '@/config/database.config';
import jwtConfig from '@/config/jwt.config';
import corsConfig from '@/config/cors.config';
import redisConfig from '@/config/redis.config';
import { validate } from '@/config/env.validation';
import { RedisModule } from '@/redis/redis.module';
import { ResponseInterceptor } from '@/core/interceptors/response.interceptor';
import { HttpExceptionFilter } from '@/core/filters/http-exception.filter';
import { OperationLogInterceptor } from '@/core/interceptors/operation-log.interceptor';
// import { SessionHeartbeatInterceptor } from '@/core/interceptors/session-heartbeat.interceptor';
import { FeatureFlagGuard } from '@/core/guards/feature-flag.guard';

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
    DashboardModule,
    ProfileModule,
    OperationLogsModule,
    DiscoveryModule,
  ],
  providers: [
    AppService,
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
