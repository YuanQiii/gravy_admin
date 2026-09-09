import { Injectable } from '@nestjs/common';
import { UAParser } from 'ua-parser-js';
import { PrismaService, SessionStore, AUTH_REALM_USER } from '@gvray/core';




export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface ParsedSessionInfo {
  tokenHash: string;
  ipAddress?: string;
  browser?: string;
  os?: string;
  device?: string;
  location?: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface OnlineUser {
  userId: string;
  username: string;
  nickname: string;
  sessionCount: number;
  lastActiveAt: string;
}

/**
 * 后台会话的薄适配器。
 *
 * 已完成深接缝重构：纯粹的 Redis 会话存取/撤销逻辑已下沉到 `SessionStore`，
 * 本类仅做 `user` 命名空间的两件事：
 * 1. 委托 `SessionStore` 完成会话写入/验证/撤销（`user` 命名空间）；
 * 2. **保留** 后台关注的 UA/location 解析与 `prisma.refreshToken` DB 归档。
 *
 * 对外方法签名保持不变，auth.service / online-users.service 无感。
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly prisma: PrismaService,
  ) {}

  // ===== Refresh Token =====

  async storeRefreshToken(
    userId: string,
    token: string,
    metadata: SessionMetadata,
    expiresInSeconds: number,
    accessTokenJti?: string,
  ): Promise<void> {
    // 解析 UA 和 IP（后台会话关注点，保留在此）
    const parsed = this.parseUserAgent(metadata.userAgent);
    const location = await this.getLocationFromIP(metadata.ipAddress);

    await this.sessionStore.store({
      ns: AUTH_REALM_USER,
      subjectId: userId,
      token,
      meta: {
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        browser: parsed.browser,
        os: parsed.os,
        device: parsed.device,
        location,
      },
      expiresInSeconds,
      accessTokenJti,
    });
  }

  /**
   * 心跳更新：通过 AT jti 查反向索引，找到对应 RT hash，更新最后活跃时间。
   * 只更新已存在的 session，不重建已删除的 key。
   */
  async touchSessionByJti(jti: string): Promise<void> {
    await this.sessionStore.touchByJti(AUTH_REALM_USER, jti);
  }

  async verifyRefreshToken(
    token: string,
  ): Promise<{ userId: string; metadata: SessionMetadata } | null> {
    const verified = await this.sessionStore.verify(AUTH_REALM_USER, token);
    if (!verified) return null;
    return { userId: verified.subjectId, metadata: verified.meta };
  }

  async revokeRefreshToken(userId: string, token: string): Promise<void> {
    await this.sessionStore.revoke(AUTH_REALM_USER, userId, token);

    // 异步归档到数据库
    this.prisma.refreshToken
      .updateMany({
        where: { token },
        data: { isRevoked: true },
      })
      .catch(() => {});
  }

  async revokeRefreshTokenByHash(
    userId: string,
    tokenHash: string,
  ): Promise<void> {
    await this.sessionStore.revokeByHash(AUTH_REALM_USER, userId, tokenHash);
  }

  /**
   * 通过 Access Token JTI 撤销对应会话（logout 时用）
   */
  async revokeByAccessTokenJti(accessTokenJti: string): Promise<void> {
    await this.sessionStore.revokeByJti(AUTH_REALM_USER, accessTokenJti);
  }

  async revokeAllUserTokens(
    userId: string,
    exceptTokenHash?: string,
  ): Promise<void> {
    await this.sessionStore.revokeAll(
      AUTH_REALM_USER,
      userId,
      exceptTokenHash,
    );

    // 同时更新数据库
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  // ===== 会话管理（在线用户）=====

  async getUserSessions(userId: string): Promise<ParsedSessionInfo[]> {
    const sessions = await this.sessionStore.getSessions(AUTH_REALM_USER, userId);
    return sessions.map((s) => ({
      tokenHash: s.tokenHash,
      ipAddress: s.ipAddress,
      browser: s.browser,
      os: s.os,
      device: s.device,
      location: s.location,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    }));
  }

  async getAllOnlineUserIds(): Promise<string[]> {
    return this.sessionStore.getAllSubjectIds(AUTH_REALM_USER);
  }

  // ===== 工具方法 =====

  private parseUserAgent(userAgent?: string): {
    browser?: string;
    os?: string;
    device?: string;
  } {
    if (!userAgent) return {};
    try {
      const parser = new UAParser(userAgent);
      const result = parser.getResult();
      const browser = result.browser.name
        ? `${result.browser.name} ${result.browser.version || ''}`.trim()
        : undefined;
      const os = result.os.name
        ? `${result.os.name} ${result.os.version || ''}`.trim()
        : undefined;
      const device = result.device.model || result.device.type || 'Desktop';
      return { browser, os, device };
    } catch {
      return {};
    }
  }

  private async getLocationFromIP(
    ipAddress?: string,
  ): Promise<string | undefined> {
    if (!ipAddress) return undefined;
    // 跳过本地 IP
    if (
      ipAddress === '127.0.0.1' ||
      ipAddress === '::1' ||
      ipAddress.startsWith('192.168.') ||
      ipAddress.startsWith('10.') ||
      ipAddress.startsWith('172.')
    ) {
      return '本地网络';
    }
    try {
      const response = await fetch(
        `http://ip-api.com/json/${ipAddress}?lang=zh-CN`,
      );
      if (!response.ok) return undefined;
      const data = (await response.json()) as {
        status: string;
        country?: string;
        regionName?: string;
        city?: string;
      };
      if (data.status === 'success') {
        const parts: string[] = [];
        if (data.country) parts.push(data.country);
        if (data.regionName && data.regionName !== data.country) {
          parts.push(data.regionName);
        }
        if (data.city && data.city !== data.regionName) {
          parts.push(data.city);
        }
        return parts.length > 0 ? parts.join('-') : undefined;
      }
    } catch {
      // 忽略查询失败
    }
    return undefined;
  }
}