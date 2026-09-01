import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionCacheService } from '@/redis/permission-cache.service';
import { PrismaService } from '@/prisma/prisma.service';
import { extractPermissionCodes, isSuperAdminOf } from '@/shared/utils/permission.util';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;

    if (!userId) {
      this.logger.log('UserId not found in request');
      return false;
    }

    // Super-admin 运行时旁路：命中 super_admin 角色直接放行，
    // 不要求角色权限码完整，也不读缓存/DB。信号取自 JWT 的 roleKeys
    // （request.user.roles），零额外查询；fail-closed：roles 缺失时等同于非超管。
    const roleKeys = (request.user?.roles ?? []).map((r) => r.roleKey);
    if (isSuperAdminOf(roleKeys)) {
      return true;
    }

    // 1. 优先从 Redis Permission Cache 取权限
    let userPermissions = await this.permissionCache.get(userId);

    // 2. 未命中则查 DB 并回填缓存
    if (!userPermissions) {
      userPermissions = await this.loadPermissionsFromDb(userId);
      if (userPermissions) {
        await this.permissionCache.set(userId, userPermissions);
      }
    }

    if (!userPermissions || userPermissions.length === 0) {
      return false;
    }

    // 3. 校验是否拥有所有需要的权限
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    return hasPermission;
  }

  private async loadPermissionsFromDb(
    userId: string,
  ): Promise<string[] | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) return null;

      return extractPermissionCodes(user.userRoles);
    } catch {
      return null;
    }
  }
}
