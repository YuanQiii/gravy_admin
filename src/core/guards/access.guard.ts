import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GuestWriteGuard } from './guest-write.guard';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';

/**
 * 受保护路由的统一编排守卫。
 *
 * 替代过去在 controller 类层级显式拼接的
 * `@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)`，
 * 把"守卫顺序"这个隐含不变量从 23 处调用点收敛到此处一处。
 *
 * 行为：
 * 1. 入口读取 `IS_PUBLIC_KEY` 元数据：
 *    - 命中（公开路由）：仅尝试运行 `JwtAuthGuard` 以填充 `request.user`，
 *      失败（无 token / 无效 token）被吞掉，访客继续以匿名身份放行；
 *      其余 3 个守卫（GuestWrite/Roles/Permissions）**不调用**，
 *      因为匿名调用没有 `request.user.roles` / `permissions` 可读。
 *      这样 controller 通过 `@CurrentUser() user?` 即可按 `user` 是否存在
 *      切换 service 的 `visibility` 行为，登录用户在公开路由上行为不变。
 *    - 未命中（受保护路由）：按 Jwt → GuestWrite → Roles → Permissions 顺序依次调用；
 *      任一守卫返回 false 或抛错即中断后续守卫。
 *
 * 4 个被编排的守卫类**保持不动**——它们成为 AccessGuard 的 internal seams，
 * 各自既有单测继续覆盖其独立行为。
 *
 * 5 个刻意差异化的变体（dashboard / profile / monitor / online-users / auth）
 * 不迁移到本守卫——它们的守卫组合是 interface 决策，强行统一会改变行为。
 *
 * `FeatureFlagGuard` 仍是全局 `APP_GUARD`，不在编排链中——
 * 其 seam 在"所有路由含无守卫路由"，与编排守卫正交。
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly guestWriteGuard: GuestWriteGuard,
    private readonly rolesGuard: RolesGuard,
    private readonly permissionsGuard: PermissionsGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 公开路由：尝试认证以填充 request.user（用于 controller 切换 visibility），
      // 无 token / 无效 token 视为匿名访客放行
      try {
        await this.jwtAuthGuard.canActivate(context);
      } catch (err) {
        this.logger.debug(
          `Public route anonymous access: ${(err as Error)?.message ?? 'no token'}`,
        );
      }
      return true;
    }

    const guards = [
      this.jwtAuthGuard,
      this.guestWriteGuard,
      this.rolesGuard,
      this.permissionsGuard,
    ];
    for (const guard of guards) {
      const ok = await guard.canActivate(context);
      if (!ok) {
        return false;
      }
    }
    return true;
  }
}
