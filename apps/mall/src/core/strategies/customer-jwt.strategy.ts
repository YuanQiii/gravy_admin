import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ICustomer } from '../interfaces/customer.interface';
import { isCustomerRealm } from '@gvray/core';

/**
 * B2C `Customer` 的 JWT 策略，注册名 `customer-jwt`（独立于后台 `jwt`）。
 *
 * 与后台 JWT 共用同一签密钥（D7）。签名由 passport-jwt 用 `jwt.secret`
 * 自动校验；`realm` 声明是两域互斥的最后一道闸：仅接受
 * `realm === 'customer'` 的 token，后台 token（`realm === 'user'`）在此被拒绝。
 */
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(
  Strategy,
  'customer-jwt',
) {
  constructor(private readonly configService: ConfigService) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<ICustomer> {
    if (!payload?.sub || !isCustomerRealm(payload.realm)) {
      throw new UnauthorizedException('无效的 Access Token');
    }
    return { customerId: payload.sub };
  }
}

/** 客户 token payload：`{ sub: customerId, realm: 'customer', jti }` */
export interface CustomerJwtPayload {
  sub?: string;
  realm?: unknown;
  jti?: string;
  iat?: number;
  exp?: number;
}