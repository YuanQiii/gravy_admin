import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { SessionStore } from '@gvray/core';

import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerTokenService } from './customer-token.service';
import { WechatCode2SessionClient } from './wechat-code2session.client';
import { CustomerJwtStrategy } from '@/core/strategies/customer-jwt.strategy';
import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { OptionalCustomerGuard } from '@/core/guards/optional-customer.guard';

/**
 * B2C 客户认证模块：注册客户 JWT 策略（`customer-jwt`）与会话存储。
 *
 * - `CustomerJwtStrategy`：校验 `realm === 'customer'` 的访问令牌（与后台共用密钥）。
 * - `SessionStore`：纯 Redis 会话，`customer` 命名空间（`cust:...`）。
 * - `CustomerJwtGuard`：强鉴权（供客户自助端点）；`OptionalCustomerGuard`：可选身份
 *   （供"公开但可识别登录客户"端点，匿名放行）。两者复用同一策略。
 * - 导出上述 Guard / SessionStore，供 B2C 各控制器/服务注入。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') || 'default-secret-key',
        signOptions: {
          expiresIn: configService.get<string>(
            'jwt.accessTokenExpiresIn',
          ) as any,
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
    WechatCode2SessionClient,
    CustomerJwtStrategy,
    CustomerJwtGuard,
    OptionalCustomerGuard,
  ],
  exports: [
    CustomerAuthService,
    CustomerTokenService,
    SessionStore,
    CustomerJwtStrategy,
    CustomerJwtGuard,
    OptionalCustomerGuard,
  ],
})
export class CustomerAuthModule {}