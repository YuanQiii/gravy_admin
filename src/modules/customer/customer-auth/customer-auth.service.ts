import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AUTH_REALM_CUSTOMER } from '@/core/constants/auth-realm.constant';
import { CustomerTokenService } from './customer-token.service';
import { CustomerLoginDto } from './dto/customer-login.dto';

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

      const accessTokenExpiresIn = this.parseExpiresIn(
        this.configService.get<string>('jwt.accessTokenExpiresIn') || '5m',
      );
      const refreshTokenExpiresIn = this.parseExpiresIn(
        this.configService.get<string>('jwt.refreshTokenExpiresIn') || '7d',
      );

      const { token: accessToken, jti } = this.generateAccessToken(
        customer.customerId,
      );
      const refreshToken = this.generateRefreshToken();

      await this.customerTokenService.storeRefreshToken(
        customer.customerId,
        refreshToken,
        reqInfo,
        refreshTokenExpiresIn,
        jti,
      );

      this.logger.log(`Customer login success: ${customer.customerId}`);
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        access_token_expires_in: accessTokenExpiresIn,
        refresh_token_expires_in: refreshTokenExpiresIn,
        expires_at: Date.now() + accessTokenExpiresIn * 1000,
      };
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

    const accessTokenExpiresIn = this.parseExpiresIn(
      this.configService.get<string>('jwt.accessTokenExpiresIn') || '5m',
    );
    const refreshTokenExpiresIn = this.parseExpiresIn(
      this.configService.get<string>('jwt.refreshTokenExpiresIn') || '7d',
    );

    const { token: accessToken, jti } = this.generateAccessToken(
      customer.customerId,
    );
    const newRefreshToken = this.generateRefreshToken();

    // 撤销旧 RT，签发新 RT（纯 Redis）
    await this.customerTokenService.revokeRefreshToken(
      customer.customerId,
      refreshToken,
    );
    await this.customerTokenService.storeRefreshToken(
      customer.customerId,
      newRefreshToken,
      verified.metadata,
      refreshTokenExpiresIn,
      jti,
    );

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      access_token_expires_in: accessTokenExpiresIn,
      refresh_token_expires_in: refreshTokenExpiresIn,
      expires_at: Date.now() + accessTokenExpiresIn * 1000,
    };
  }

  /** 通过 Access Token JTI 撤销当前客户会话（logout 时用，纯 Redis） */
  async logout(accessTokenJti?: string): Promise<void> {
    if (accessTokenJti) {
      await this.customerTokenService.revokeByAccessTokenJti(accessTokenJti);
    }
  }

  // ===== 私有方法 =====

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