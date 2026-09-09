import { Injectable } from '@nestjs/common';
import { SessionStore, AUTH_REALM_CUSTOMER } from '@gvray/core';



export interface CustomerSessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * B2C `Customer` 会话的薄适配器。
 *
 * 与后台 `TokenService` 复用同一个纯 Redis `SessionStore`，但使用独立
 * `customer` 命名空间（key 前缀 `cust:...`），与后台会话严格隔离。
 * B2C 会话为易失态（ADR 0009）：**无** `prisma.refreshToken` DB 归档。
 */
@Injectable()
export class CustomerTokenService {
  constructor(private readonly sessionStore: SessionStore) {}

  async storeRefreshToken(
    customerId: string,
    token: string,
    metadata: CustomerSessionMetadata,
    expiresInSeconds: number,
    accessTokenJti?: string,
  ): Promise<void> {
    await this.sessionStore.store({
      ns: AUTH_REALM_CUSTOMER,
      subjectId: customerId,
      token,
      meta: {
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
      expiresInSeconds,
      accessTokenJti,
    });
  }

  async verifyRefreshToken(
    token: string,
  ): Promise<{ customerId: string; metadata: CustomerSessionMetadata } | null> {
    const verified = await this.sessionStore.verify(
      AUTH_REALM_CUSTOMER,
      token,
    );
    if (!verified) return null;
    return { customerId: verified.subjectId, metadata: verified.meta };
  }

  async revokeRefreshToken(customerId: string, token: string): Promise<void> {
    await this.sessionStore.revoke(AUTH_REALM_CUSTOMER, customerId, token);
  }

  /** 通过 Access Token JTI 撤销对应客户会话（logout 时用） */
  async revokeByAccessTokenJti(accessTokenJti: string): Promise<void> {
    await this.sessionStore.revokeByJti(AUTH_REALM_CUSTOMER, accessTokenJti);
  }

  /** 心跳更新：通过 AT jti 更新客户会话最后活跃时间 */
  async touchSessionByJti(jti: string): Promise<void> {
    await this.sessionStore.touchByJti(AUTH_REALM_CUSTOMER, jti);
  }
}