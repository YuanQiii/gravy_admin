import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly KEY_PREFIX = 'perm:user';
  private readonly DEFAULT_TTL = 3600; // 1 小时

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 设置用户权限缓存
   */
  async set(
    userId: string,
    codes: string[],
    ttlSeconds = this.DEFAULT_TTL,
  ): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }
    try {
      await this.redisService.set(this.key(userId), JSON.stringify(codes), {
        ttlSeconds,
      });
    } catch {
      // 缓存写入失败不影响业务
    }
  }

  /**
   * 获取用户权限缓存
   * @returns 权限码数组，未命中返回 null
   */
  async get(userId: string): Promise<string[] | null> {
    if (!this.redisService.isAvailable()) {
      return null;
    }
    try {
      const raw = await this.redisService.get(this.key(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * 失效单个用户的权限缓存（踢人、改用户角色/权限时调用）
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.del(userId);
  }

  /**
   * 失效某个角色关联的所有用户的权限缓存
   * 响应角色权限变更对全部受影响用户的生效
   */
  async invalidateRole(roleId: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    for (const ur of userRoles) {
      await this.del(ur.userId);
    }
  }

  /**
   * 按权限反查所有受影响用户并失效其权限缓存。
   *
   * 覆盖"权限集合变更（如扫描器软删除/更新权限）"对全部关联用户的生效，
   * 将 权限 → 角色 → 用户 的反向检索收口到缓存服务（单一来源）。
   *
   * fail-closed：permissionIds 为空、Redis 不可用、或无关联角色/用户时均 no-op 返回 0。
   *
   * @returns 受影响的用户数（用于日志/观测）
   */
  async invalidateUsersByPermissionIds(
    permissionIds: string[],
  ): Promise<number> {
    if (!permissionIds?.length || !this.redisService.isAvailable()) {
      return 0;
    }
    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { permissionId: { in: permissionIds } },
      select: { roleId: true },
    });
    const roleIds = [...new Set(rolePerms.map((rp) => rp.roleId))];
    if (roleIds.length === 0) {
      return 0;
    }
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId: { in: roleIds } },
      select: { userId: true },
    });
    const userIds = [...new Set(userRoles.map((ur) => ur.userId))];
    for (const userId of userIds) {
      await this.del(userId);
    }
    return userIds.length;
  }

  /**
   * 删除用户权限缓存
   */
  private async del(userId: string): Promise<void> {
    if (!this.redisService.isAvailable()) {
      return;
    }
    try {
      await this.redisService.del(this.key(userId));
    } catch {
      // 缓存删除失败不影响业务
    }
  }

  private key(userId: string): string {
    return `${this.KEY_PREFIX}:${userId}`;
  }
}
