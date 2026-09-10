import { Injectable, Logger, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService, AUTH_REALM_CUSTOMER } from '@gvray/core';


import { CustomerTokenService } from './customer-token.service';
import { CustomerSessionMetadata } from './customer-token.service';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { WechatCode2SessionClient } from './wechat-code2session.client';
import {
  wechatUsernameCandidates,
  wechatPlaceholderPassword,
} from './wechat-identity';

export interface CustomerLoginRequestInfo {
  ipAddress?: string;
  userAgent?: string;
}

export interface CustomerTokenResult {
  access_token: string;
  refresh_token: string;
  access_token_expires_in: number;
  refresh_token_expires_in: number;
  expires_at: number;
}

/**
 * B2C 客户认证服务。
 *
 * - `login`：按 `username → email → phoneNumber` 顺序以 `identifier` 解析客户，
 *   bcrypt 校验密码，签发 `{ sub: customerId, realm: 'customer' }` 的 access + refresh token。
 * - `refresh` / `logout`：复用 `CustomerTokenService`（`customer` 命名空间，纯 Redis，
 *   无 DB 归档）验证/撤销客户会话。
 *
 * 任一失败统一 401、话术一致；不打印 token。
 */
@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly customerTokenService: CustomerTokenService,
    private readonly wechatClient: WechatCode2SessionClient,
  ) {}

  async login(
    dto: CustomerLoginDto,
    reqInfo: CustomerLoginRequestInfo = {},
  ): Promise<CustomerTokenResult> {
    try {
      const customer = await this.resolveCustomer(dto.identifier);
      if (!customer || customer.status !== 'enabled') {
        throw new UnauthorizedException('账号或密码错误');
      }

      const passwordOk = await bcrypt.compare(dto.password, customer.password);
      if (!passwordOk) {
        throw new UnauthorizedException('账号或密码错误');
      }

      const result = await this.issueSession(customer.customerId, reqInfo);

      this.logger.log(`Customer login success: ${customer.customerId}`);
      return result;
    } catch (error) {
      this.logger.warn('Customer login failed');
      throw error;
    }
  }

  async refresh(refreshToken: string): Promise<CustomerTokenResult> {
    const verified =
      await this.customerTokenService.verifyRefreshToken(refreshToken);
    if (!verified) {
      throw new UnauthorizedException('Refresh token 无效或已过期');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { customerId: verified.customerId },
    });
    if (!customer || customer.deletedAt || customer.status !== 'enabled') {
      throw new UnauthorizedException('Refresh token 无效或已过期');
    }

    // 撤销旧 RT，签发新 RT（轮换策略留在 refresh 自身）
    await this.customerTokenService.revokeRefreshToken(
      customer.customerId,
      refreshToken,
    );

    return this.issueSession(customer.customerId, verified.metadata);
  }

  /**
   * 微信小程序静默登录：`code -> openid -> Customer`。
   * - openid 命中 → 直接登录；未命中 → 幂等自动建号后登录。
   * - 软删 / disabled → 401 不发放。
   * 令牌经 `issueSession` 发放，响应结构与账密登录一致（realm customer）。
   */
  async wechatLogin(
    code: string,
    reqInfo: CustomerLoginRequestInfo = {},
  ): Promise<CustomerTokenResult> {
    const { openid } = await this.wechatClient.code2Session(code);

    let customer = await this.prisma.customer.findUnique({
      where: { openid },
    });

    if (!customer) {
      customer = await this.createWechatCustomer(openid);
    }

    if (customer.deletedAt || customer.status !== 'enabled') {
      throw new UnauthorizedException('该账号不可用');
    }

    return this.issueSession(customer.customerId, reqInfo);
  }

  /** 通过 Access Token JTI 撤销当前客户会话（logout 时用，纯 Redis） */
  async logout(accessTokenJti?: string): Promise<void> {
    if (accessTokenJti) {
      await this.customerTokenService.revokeByAccessTokenJti(accessTokenJti);
    }
  }

  // ===== 私有方法 =====

  /**
   * 唯一会话发放装配点（internal seam）：login / refresh / wechatLogin 共用。
   * TTL 解析 → 签发 AT/RT → 存储 RT → 组装响应。
   */
  private async issueSession(
    customerId: string,
    meta: CustomerSessionMetadata,
  ): Promise<CustomerTokenResult> {
    const accessTokenExpiresIn = this.parseExpiresIn(
      this.configService.get<string>('jwt.accessTokenExpiresIn') || '5m',
    );
    const refreshTokenExpiresIn = this.parseExpiresIn(
      this.configService.get<string>('jwt.refreshTokenExpiresIn') || '7d',
    );

    const { token: accessToken, jti } = this.generateAccessToken(customerId);
    const refreshToken = this.generateRefreshToken();

    await this.customerTokenService.storeRefreshToken(
      customerId,
      refreshToken,
      meta,
      refreshTokenExpiresIn,
      jti,
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expires_in: accessTokenExpiresIn,
      refresh_token_expires_in: refreshTokenExpiresIn,
      expires_at: Date.now() + accessTokenExpiresIn * 1000,
    };
  }

  /** 按 username → email → phoneNumber 顺序解析客户（含 deletedAt 过滤） */
  private async resolveCustomer(
    identifier: string,
  ): Promise<{ customerId: string; password: string; status: string } | null> {
    const candidates = [
      { username: identifier },
      { email: identifier },
      { phoneNumber: identifier },
    ];
    for (const where of candidates) {
      const customer = await this.prisma.customer.findFirst({
        where: { ...where, deletedAt: null },
        select: { customerId: true, password: true, status: true },
      });
      if (customer) return customer;
    }
    return null;
  }

  /**
   * 幂等自动建号：按 `username` 候选序列逐试试唯一（撞了取下一候选）；
   * 并发时 `openid`/`username` 唯一索引冲突（P2002）→ 捕获后重查改为登录。
   * 候选耗尽仍冲突 → 500（openid + hash 双重碰撞，宇宙级概率）。
   */
  private async createWechatCustomer(openid: string) {
    const candidates = wechatUsernameCandidates(openid);
    // 占位密码：bcrypt 哈希随机秘钥，bcrypt.compare 对被攻破者不可行 → 该客户
    // 无法经账密登录（compare 返回 false → 401，而非抛错）
    const placeholderHash = await bcrypt.hash(wechatPlaceholderPassword(), 10);
    for (const username of candidates) {
      try {
        return await this.prisma.customer.create({
          data: {
            username,
            password: placeholderHash,
            nickName: '微信用户',
            status: 'enabled',
            openid,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // 并发或候选被占，重查确认是否已是该 openid 的既有客户
          const existing = await this.prisma.customer.findUnique({
            where: { openid },
          });
          if (existing) return existing;
          // 不是同一 openid 冲突 → 尝试下一候选
          continue;
        }
        throw error;
      }
    }
    throw new InternalServerErrorException('微信账号创建失败');
  }

  private generateAccessToken(customerId: string): {
    token: string;
    jti: string;
  } {
    const expiresIn =
      this.configService.get<string>('jwt.accessTokenExpiresIn') || '5m';
    const jti = crypto.randomUUID();
    const token = this.jwtService.sign(
      { sub: customerId, realm: AUTH_REALM_CUSTOMER, jti },
      { expiresIn: expiresIn as any },
    );
    return { token, jti };
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 2 * 60 * 60;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 2 * 60 * 60;
    }
  }
}