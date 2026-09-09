import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { CustomerRefreshTokenDto } from './dto/customer-refresh-token.dto';
import { ResponseUtil } from '@gvray/core';

import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';

interface CustomerRequest {
  headers?: Record<string, string | string[]>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
  ip?: string;
}

@ApiTags('客户认证')
@Controller('auth')
export class CustomerAuthController {
  constructor(
    private readonly customerAuthService: CustomerAuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: '客户登录',
    description: '支持用户名/邮箱/手机号登录，返回 access token 与 refresh token',
  })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '账号或密码错误' })
  async login(@Body() dto: CustomerLoginDto, @Req() req: CustomerRequest) {
    const data = await this.customerAuthService.login(dto, {
      ipAddress: this.getClientIp(req),
      userAgent: (req?.headers?.['user-agent'] as string) || '',
    });
    return ResponseUtil.success(data, '登录成功');
  }

  @Post('refresh')
  @ApiOperation({ summary: '刷新客户访问令牌' })
  @ApiResponse({ status: 200, description: '刷新令牌成功' })
  @ApiResponse({ status: 401, description: 'Refresh token 无效或已过期' })
  async refresh(@Body() dto: CustomerRefreshTokenDto) {
    const data = await this.customerAuthService.refresh(dto.refreshToken);
    return ResponseUtil.success(data, '刷新令牌成功');
  }

  @Post('logout')
  @UseGuards(CustomerJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '客户退出登录' })
  @ApiResponse({ status: 200, description: '退出登录成功' })
  @ApiResponse({ status: 401, description: 'JWT 令牌无效或已过期' })
  async logout(
    @Req() req: { headers: { authorization?: string } },
  ) {
    const jti = this.extractAccessTokenJti(req);
    await this.customerAuthService.logout(jti);
    return ResponseUtil.success(null, '退出登录成功');
  }

  private extractAccessTokenJti(req: {
    headers: { authorization?: string };
  }): string | undefined {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.decode(token) as { jti?: string } | null;
      return payload?.jti;
    } catch {
      return undefined;
    }
  }

  private getClientIp(req: CustomerRequest): string {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      (req?.headers?.['x-real-ip'] as string) ||
      (req?.headers?.['x-client-ip'] as string) ||
      (req?.headers?.['x-cluster-client-ip'] as string) ||
      req?.connection?.remoteAddress ||
      req?.socket?.remoteAddress ||
      req?.ip ||
      '127.0.0.1';
    return ip === '::1' ? '127.0.0.1' : ip;
  }
}