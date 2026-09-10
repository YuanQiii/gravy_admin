import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../types/jwt-payload.type';
import { IUser } from '../interfaces/user.interface';
import { UserStatus } from '../../shared/constants/user-status.constant';
import { AUTH_REALM_USER } from '../constants/auth-realm.constant';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const secretOrKey = configService.get<string>('jwt.secret');
    if (!secretOrKey) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey,
    });
  }

  async validate(payload: JwtPayload): Promise<IUser> {
    if (!payload?.sub || !payload.roleKeys) {
      throw new UnauthorizedException('无效的 Access Token');
    }

    // 认证域互斥显式断言（ADR 0010 D5）：明确拒绝 customer 域 token，
    // 替换"customer token 恰好缺 roleKeys 被间接拒绝"的巧合防线。
    // 凡 realm 非 user（含缺失 realm 的 token）一律拒绝——缺 realm 兼容窗口
    // 已于收紧后移除，后台唯一签发路径始终携带 realm: AUTH_REALM_USER。
    if (payload.realm !== AUTH_REALM_USER) {
      throw new UnauthorizedException('无效的 Access Token');
    }

    if (!payload.status || payload.status !== UserStatus.ENABLED) {
      throw new UnauthorizedException('用户已被禁用');
    }

    return {
      userId: payload.sub,
      email: payload.email ?? null,
      username: payload.username,
      nickname: payload.nickname,
      avatar: payload.avatar ?? null,
      status: payload.status || UserStatus.ENABLED,
      createdAt: new Date(payload.iat * 1000),
      updatedAt: new Date(payload.iat * 1000),
      roles: payload.roleKeys.map((roleKey) => ({
        roleId: '',
        name: roleKey,
        roleKey,
        description: null,
        createdAt: new Date(payload.iat * 1000),
        updatedAt: new Date(payload.iat * 1000),
        permissions: [],
      })),
    };
  }
}
