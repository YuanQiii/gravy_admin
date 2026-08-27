import { SetMetadata } from '@nestjs/common';

/**
 * 元数据键：标记路由为公开访问（无需 JWT 认证）。
 *
 * 仅 `AccessGuard` 在编排入口读取此键并短路放行；4 个被编排的守卫
 * （JwtAuthGuard / GuestWriteGuard / RolesGuard / PermissionsGuard）
 * 不再各自重复读取——守卫顺序不变量集中在 AccessGuard 一处。
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标记接口为公开访问（匿名访客可调用）。
 *
 * ⚠️ 警告：仅用于真正公开的 GET 接口，禁止挂在写操作（POST/PATCH/DELETE）上。
 * 公开写操作会绕过认证与 RBAC，导致任何匿名访客均可修改数据。
 *
 * 路由层须配合 `@Throttle({ default: { limit: 60, ttl: 60000 } })` 做限流。
 *
 * @example
 * @Get()
 * @Public()
 * @Throttle({ default: { limit: 60, ttl: 60000 } })
 * async findAll(...) { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
