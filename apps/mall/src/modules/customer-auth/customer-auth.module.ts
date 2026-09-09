import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { SessionStore } from '@gvray/core';

import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerTokenService } from './customer-token.service';
import { CustomerJwtStrategy } from '@/core/strategies/customer-jwt.strategy';
import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';

/**
 * B2C 客户认证模块：注册客户 JWT 策略（`customer-jwt`）与会话存储。
 *
 * - `CustomerJwtStrategy`：校验 `realm === 'customer'` 的访问令牌（与后台共用密钥）。
 * - `SessionStore`：纯 Redis 会话，`customer` 命名空间（`cust:...`）。
 * - 导出 `CustomerJwtGuard` / `SessionStore`，供 B2C 各控制器/服务注入。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') || 'default-secret-key',
        signOptions: {
          expiresIn: (configService.get<string>('jwt.accessTokenExpiresIn') ||
            '2h') as any,
        },
      }),
    }),
    PassportModule.register({
      defaultStrategy: 'customer-jwt',
      session: false,
    }),
  ],
  controllers: [CustomerAuthController],
  providers: [
    CustomerAuthService,
    CustomerTokenService,
    SessionStore,
    CustomerJwtStrategy,
    CustomerJwtGuard,
  ],
  exports: [
    CustomerAuthService,
    CustomerTokenService,
    SessionStore,
    CustomerJwtStrategy,
    CustomerJwtGuard,
  ],
})
export class CustomerAuthModule {}