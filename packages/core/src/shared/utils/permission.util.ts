/**
 * 用户权限/角色码抽取的纯函数工具。
 *
 * 这些函数无副作用、不依赖 DI/DB，只负责从一个已加载的嵌套
 * `userRoles → role → rolePermissions → permission` 结构中，
 * 去重提取权限码与角色码。用于收敛分散在认证/授权各处的相同手写逻辑，
 * 保证"去重 + 类型过滤"语义只有一份定义。
 */

import { SUPER_ROLE_KEY } from '../constants/role.constant';

interface PermissionRecord {
  code?: string | null;
  type?: string | null;
}

interface RolePermissionEntry {
  permission?: PermissionRecord | null;
}

interface UserRoleRecord {
  role?: {
    roleKey?: string | null;
    rolePermissions?: Array<RolePermissionEntry | null> | null;
  } | null;
}

export type ExtractableUserRole = UserRoleRecord | null | undefined;

export interface ExtractPermissionCodesOptions {
  /** 需要过滤掉的权限类型（如仅前端投影需排除 'API'） */
  excludeTypes?: string[];
}

/**
 * 从嵌套 userRoles 中提取用户权限码，去重并按需过滤类型。
 *
 * @param userRoles 已加载的 userRoles 数组（各层均可为 null）
 * @param opts.excludeTypes 需要排除的 permission.type（例如 ['API']）
 * @returns 去重后的权限码数组，空输入返回 []
 */
export function extractPermissionCodes(
  userRoles: readonly ExtractableUserRole[] | null | undefined,
  opts?: ExtractPermissionCodesOptions,
): string[] {
  const excludedTypes = new Set(opts?.excludeTypes ?? []);

  return Array.from(
    new Set(
      (userRoles ?? [])
        .flatMap((ur) => ur?.role?.rolePermissions ?? [])
        .map((rp) => rp?.permission)
        .filter((perm): perm is PermissionRecord => !!perm)
        .filter((perm) => !(perm.type && excludedTypes.has(perm.type)))
        .map((perm) => perm.code)
        .filter(
          (code): code is string => typeof code === 'string' && code.length > 0,
        ),
    ),
  );
}

/**
 * 从嵌套 userRoles 中提取用户角色码，去重，跳过空值。
 *
 * @param userRoles 已加载的 userRoles 数组（各层均可为 null）
 * @returns 去重后的角色码数组，空输入返回 []
 */
export function extractRoleKeys(
  userRoles: readonly ExtractableUserRole[] | null | undefined,
): string[] {
  return Array.from(
    new Set(
      (userRoles ?? [])
        .map((ur) => ur?.role?.roleKey)
        .filter(
          (key): key is string => typeof key === 'string' && key.length > 0,
        ),
    ),
  );
}

/**
 * 判定给定角色码集合是否包含超级管理员角色（fail-closed：空/缺省返回 false）。
 *
 * @param roleKeys 角色码数组（可由 `extractRoleKeys(userRoles)` 生成，或来自 JWT 的 `request.user.roles`）
 * @returns 含 `super_admin` 返回 true，否则 false
 */
export function isSuperAdminOf(
  roleKeys: readonly string[] | null | undefined,
): boolean {
  return (roleKeys ?? []).includes(SUPER_ROLE_KEY);
}
