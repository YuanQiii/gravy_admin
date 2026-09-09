/**
 * 权限常量配置
 * 统一管理所有权限代码，供后端控制器和前端使用
 *
 * 命名规范：{module}:{resource}:{action}
 * - module: 模块名（如 system）
 * - resource: 资源名（如 user, role）
 * - action: 操作名（必须使用标准 action 词库）
 */

// ==================== 权限元数据 ====================
export interface PermissionMeta {
  sensitive?: boolean; // 是否敏感操作（仅开发时标记，不入数据库）
  notes?: string; // 开发备注
}

const metaMap = new Map<string, PermissionMeta>();

/**
 * 定义权限代码并记录元数据（供扫描器日志使用，不入数据库）
 * @param code 权限代码
 * @param meta 元数据（sensitive / notes）
 * @returns 权限代码
 */
export function definePermission(
  code: string,
  meta: PermissionMeta = {},
): string {
  metaMap.set(code, meta);
  return code;
}

/** 权限代码 → 元数据映射（扫描器使用） */
export const PERMISSION_METADATA_MAP = metaMap;

// ==================== 标准 Action 词库 ====================
export const PERMISSION_ACTIONS = {
  // 查询
  LIST: 'list',
  VIEW: 'view',

  // CRUD
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',

  // 数据管理
  CLEAN: 'clean', // 清理历史数据（按条件）
  CLEAR: 'clear', // 清空全部数据（危险）

  // 数据交换
  IMPORT: 'import',
  EXPORT: 'export',

  // 特殊操作
  SCAN: 'scan',

  // 关系管理（update- 前缀，覆盖分配与移除）
  UPDATE_USERS: 'update-users',
  UPDATE_ROLES: 'update-roles',
  UPDATE_PERMISSIONS: 'update-permissions',
  UPDATE_DATA_SCOPE: 'update-data-scope',

  // 其他
  RESET_PASSWORD: 'reset-password',
} as const;

// ==================== 用户管理权限 ====================
const USER_RESOURCE = 'system:user';
export const USER_PERMISSIONS = {
  LIST: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
  IMPORT: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.IMPORT}`),
  EXPORT: definePermission(`${USER_RESOURCE}:${PERMISSION_ACTIONS.EXPORT}`),
  UPDATE_ROLES: definePermission(
    `${USER_RESOURCE}:${PERMISSION_ACTIONS.UPDATE_ROLES}`,
  ),
  RESET_PASSWORD: definePermission(
    `${USER_RESOURCE}:${PERMISSION_ACTIONS.RESET_PASSWORD}`,
  ),
} as const;

// ==================== 角色管理权限 ====================
const ROLE_RESOURCE = 'system:role';
export const ROLE_PERMISSIONS = {
  LIST: definePermission(`${ROLE_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${ROLE_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${ROLE_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${ROLE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${ROLE_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
  UPDATE_PERMISSIONS: definePermission(
    `${ROLE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE_PERMISSIONS}`,
  ),
  UPDATE_USERS: definePermission(
    `${ROLE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE_USERS}`,
  ),
  UPDATE_DATA_SCOPE: definePermission(
    `${ROLE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE_DATA_SCOPE}`,
  ),
} as const;

// ==================== 权限管理权限 ====================
const PERMISSION_RESOURCE = 'system:permission';
export const PERMISSION_PERMISSIONS = {
  LIST: definePermission(`${PERMISSION_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${PERMISSION_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  UPDATE: definePermission(
    `${PERMISSION_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
    {
      sensitive: true,
      notes: '修改权限配置，影响系统权限控制',
    },
  ),
  SCAN: definePermission(`${PERMISSION_RESOURCE}:${PERMISSION_ACTIONS.SCAN}`, {
    sensitive: true,
    notes: '扫描权限目录，影响系统权限配置',
  }),
} as const;

// ==================== 部门管理权限 ====================
const DEPARTMENT_RESOURCE = 'system:department';
export const DEPARTMENT_PERMISSIONS = {
  LIST: definePermission(`${DEPARTMENT_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${DEPARTMENT_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(
    `${DEPARTMENT_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${DEPARTMENT_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${DEPARTMENT_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 岗位管理权限 ====================
const POSITION_RESOURCE = 'system:position';
export const POSITION_PERMISSIONS = {
  LIST: definePermission(`${POSITION_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${POSITION_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${POSITION_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${POSITION_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${POSITION_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
} as const;

// ==================== 字典管理权限 ====================
const DICTIONARY_RESOURCE = 'system:dictionary';
export const DICTIONARY_PERMISSIONS = {
  LIST: definePermission(`${DICTIONARY_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${DICTIONARY_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(
    `${DICTIONARY_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${DICTIONARY_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${DICTIONARY_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 配置管理权限 ====================
const CONFIG_RESOURCE = 'system:config';
export const CONFIG_PERMISSIONS = {
  LIST: definePermission(`${CONFIG_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${CONFIG_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${CONFIG_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`, {
    sensitive: true,
    notes: '创建系统配置项',
  }),
  UPDATE: definePermission(`${CONFIG_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`, {
    sensitive: true,
    notes: '修改系统配置项',
  }),
  DELETE: definePermission(`${CONFIG_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`, {
    sensitive: true,
    notes: '删除系统配置项',
  }),
} as const;

// ==================== 菜单管理权限 ====================
const MENU_RESOURCE = 'system:menu';
export const MENU_PERMISSIONS = {
  LIST: definePermission(`${MENU_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${MENU_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${MENU_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${MENU_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${MENU_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
} as const;

// ==================== 日志管理权限 ====================
const LOG_RESOURCE = 'system:log';
export const LOG_PERMISSIONS = {
  VIEW: definePermission(`${LOG_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
} as const;

// ==================== 登录日志权限 ====================
const LOGIN_LOG_RESOURCE = 'system:log-login';
export const LOGIN_LOG_PERMISSIONS = {
  LIST: definePermission(`${LOGIN_LOG_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${LOGIN_LOG_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  DELETE: definePermission(
    `${LOGIN_LOG_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
    {
      sensitive: true,
      notes: '删除登录日志',
    },
  ),
  CLEAN: definePermission(`${LOGIN_LOG_RESOURCE}:${PERMISSION_ACTIONS.CLEAN}`, {
    sensitive: true,
    notes: '按条件清理登录日志',
  }),
  CLEAR: definePermission(`${LOGIN_LOG_RESOURCE}:${PERMISSION_ACTIONS.CLEAR}`, {
    sensitive: true,
    notes: '清空全部登录日志，不可恢复',
  }),
} as const;

// ==================== 操作日志权限 ====================
const OPERATION_LOG_RESOURCE = 'system:log-operation';
export const OPERATION_LOG_PERMISSIONS = {
  LIST: definePermission(
    `${OPERATION_LOG_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${OPERATION_LOG_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  DELETE: definePermission(
    `${OPERATION_LOG_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
    {
      sensitive: true,
      notes: '删除操作日志',
    },
  ),
  CLEAN: definePermission(
    `${OPERATION_LOG_RESOURCE}:${PERMISSION_ACTIONS.CLEAN}`,
    {
      sensitive: true,
      notes: '按条件清理操作日志',
    },
  ),
  CLEAR: definePermission(
    `${OPERATION_LOG_RESOURCE}:${PERMISSION_ACTIONS.CLEAR}`,
    {
      sensitive: true,
      notes: '清空全部操作日志，不可恢复',
    },
  ),
} as const;

// ==================== 在线用户管理权限 ====================
const ONLINE_USER_RESOURCE = 'monitor:online-user';
export const ONLINE_USER_PERMISSIONS = {
  LIST: definePermission(`${ONLINE_USER_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${ONLINE_USER_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  KICK: definePermission(`${ONLINE_USER_RESOURCE}:kick`, {
    sensitive: true,
    notes: '强制踢用户下线',
  }),
} as const;

// ==================== 系统监控权限 ====================
const MONITOR_RESOURCE = 'monitor:server';
export const MONITOR_PERMISSIONS = {
  LIST: definePermission(`${MONITOR_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${MONITOR_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
} as const;

// ==================== 缓存监控权限 ====================
const CACHE_RESOURCE = 'monitor:cache';
export const CACHE_PERMISSIONS = {
  LIST: definePermission(`${CACHE_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${CACHE_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CLEAR: definePermission(`${CACHE_RESOURCE}:${PERMISSION_ACTIONS.CLEAR}`, {
    sensitive: true,
    notes: '清理 Redis 缓存数据',
  }),
} as const;

// ==================== 通知通告管理权限 ====================
const NOTICE_RESOURCE = 'system:notice';
export const NOTICE_PERMISSIONS = {
  LIST: definePermission(`${NOTICE_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${NOTICE_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${NOTICE_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${NOTICE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${NOTICE_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
} as const;

// ==================== 设备品牌权限（业务域）====================
const EQUIPMENT_BRAND_RESOURCE = 'equipment:brand';
export const EQUIPMENT_BRAND_PERMISSIONS = {
  LIST: definePermission(
    `${EQUIPMENT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${EQUIPMENT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${EQUIPMENT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${EQUIPMENT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${EQUIPMENT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 热门品牌权限（业务域）====================
const EQUIPMENT_HOT_BRAND_RESOURCE = 'equipment:hotBrand';
export const EQUIPMENT_HOT_BRAND_PERMISSIONS = {
  VIEW: definePermission(
    `${EQUIPMENT_HOT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  UPDATE: definePermission(
    `${EQUIPMENT_HOT_BRAND_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
} as const;

// ==================== 设备目录权限（业务域）====================
const EQUIPMENT_CATALOG_RESOURCE = 'equipment:catalog';
export const EQUIPMENT_CATALOG_PERMISSIONS = {
  LIST: definePermission(
    `${EQUIPMENT_CATALOG_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${EQUIPMENT_CATALOG_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${EQUIPMENT_CATALOG_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${EQUIPMENT_CATALOG_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${EQUIPMENT_CATALOG_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 滤清器类型权限（业务域）====================
const EQUIPMENT_FILTER_TYPE_RESOURCE = 'equipment:filter-type';
export const EQUIPMENT_FILTER_TYPE_PERMISSIONS = {
  LIST: definePermission(
    `${EQUIPMENT_FILTER_TYPE_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${EQUIPMENT_FILTER_TYPE_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${EQUIPMENT_FILTER_TYPE_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${EQUIPMENT_FILTER_TYPE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${EQUIPMENT_FILTER_TYPE_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 滤清器权限（业务域）====================
const EQUIPMENT_FILTER_RESOURCE = 'equipment:filter';
export const EQUIPMENT_FILTER_PERMISSIONS = {
  LIST: definePermission(
    `${EQUIPMENT_FILTER_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${EQUIPMENT_FILTER_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${EQUIPMENT_FILTER_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${EQUIPMENT_FILTER_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${EQUIPMENT_FILTER_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 设备档案权限（业务域）====================
const EQUIPMENT_EQUIPMENT_RESOURCE = 'equipment:equipment';
export const EQUIPMENT_PERMISSIONS = {
  LIST: definePermission(
    `${EQUIPMENT_EQUIPMENT_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${EQUIPMENT_EQUIPMENT_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${EQUIPMENT_EQUIPMENT_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${EQUIPMENT_EQUIPMENT_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${EQUIPMENT_EQUIPMENT_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 询价单权限（业务域）====================
const INQUIRY_RESOURCE = 'inquiry:inquiry';
export const INQUIRY_PERMISSIONS = {
  LIST: definePermission(`${INQUIRY_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${INQUIRY_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${INQUIRY_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${INQUIRY_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${INQUIRY_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
} as const;

// ==================== 询价单明细权限（业务域）====================
const INQUIRY_LINE_RESOURCE = 'inquiry:inquiry-line';
export const INQUIRY_LINE_PERMISSIONS = {
  LIST: definePermission(`${INQUIRY_LINE_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${INQUIRY_LINE_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(
    `${INQUIRY_LINE_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${INQUIRY_LINE_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${INQUIRY_LINE_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 客户权限（业务域）====================
const CUSTOMER_RESOURCE = 'customer:customer';
export const CUSTOMER_PERMISSIONS = {
  LIST: definePermission(`${CUSTOMER_RESOURCE}:${PERMISSION_ACTIONS.LIST}`),
  VIEW: definePermission(`${CUSTOMER_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`),
  CREATE: definePermission(`${CUSTOMER_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`),
  UPDATE: definePermission(`${CUSTOMER_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`),
  DELETE: definePermission(`${CUSTOMER_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`),
} as const;

// ==================== 客户地址权限（业务域）====================
const CUSTOMER_ADDRESS_RESOURCE = 'customer:address';
export const CUSTOMER_ADDRESS_PERMISSIONS = {
  LIST: definePermission(
    `${CUSTOMER_ADDRESS_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${CUSTOMER_ADDRESS_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${CUSTOMER_ADDRESS_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  UPDATE: definePermission(
    `${CUSTOMER_ADDRESS_RESOURCE}:${PERMISSION_ACTIONS.UPDATE}`,
  ),
  DELETE: definePermission(
    `${CUSTOMER_ADDRESS_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 客户收藏权限（业务域）====================
const CUSTOMER_FAVORITE_RESOURCE = 'customer:favorite';
export const CUSTOMER_FAVORITE_PERMISSIONS = {
  LIST: definePermission(
    `${CUSTOMER_FAVORITE_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${CUSTOMER_FAVORITE_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  CREATE: definePermission(
    `${CUSTOMER_FAVORITE_RESOURCE}:${PERMISSION_ACTIONS.CREATE}`,
  ),
  DELETE: definePermission(
    `${CUSTOMER_FAVORITE_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 客户浏览历史权限（业务域）====================
const CUSTOMER_HISTORY_RESOURCE = 'customer:history';
export const CUSTOMER_HISTORY_PERMISSIONS = {
  LIST: definePermission(
    `${CUSTOMER_HISTORY_RESOURCE}:${PERMISSION_ACTIONS.LIST}`,
  ),
  VIEW: definePermission(
    `${CUSTOMER_HISTORY_RESOURCE}:${PERMISSION_ACTIONS.VIEW}`,
  ),
  DELETE: definePermission(
    `${CUSTOMER_HISTORY_RESOURCE}:${PERMISSION_ACTIONS.DELETE}`,
  ),
} as const;

// ==================== 导出所有权限配置 ====================
export const PERMISSIONS = {
  USER: USER_PERMISSIONS,
  ROLE: ROLE_PERMISSIONS,
  PERMISSION: PERMISSION_PERMISSIONS,
  DEPARTMENT: DEPARTMENT_PERMISSIONS,
  POSITION: POSITION_PERMISSIONS,
  DICTIONARY: DICTIONARY_PERMISSIONS,
  CONFIG: CONFIG_PERMISSIONS,
  MENU: MENU_PERMISSIONS,
  LOG: LOG_PERMISSIONS,
  LOGIN_LOG: LOGIN_LOG_PERMISSIONS,
  OPERATION_LOG: OPERATION_LOG_PERMISSIONS,
  ONLINE_USER: ONLINE_USER_PERMISSIONS,
  MONITOR: MONITOR_PERMISSIONS,
  CACHE: CACHE_PERMISSIONS,
  NOTICE: NOTICE_PERMISSIONS,
  // 业务域（add-equipment-inquiry-customer-domains）
  EQUIPMENT_BRAND: EQUIPMENT_BRAND_PERMISSIONS,
  EQUIPMENT_CATALOG: EQUIPMENT_CATALOG_PERMISSIONS,
  EQUIPMENT_FILTER_TYPE: EQUIPMENT_FILTER_TYPE_PERMISSIONS,
  EQUIPMENT_FILTER: EQUIPMENT_FILTER_PERMISSIONS,
  EQUIPMENT: EQUIPMENT_PERMISSIONS,
  INQUIRY: INQUIRY_PERMISSIONS,
  INQUIRY_LINE: INQUIRY_LINE_PERMISSIONS,
  CUSTOMER: CUSTOMER_PERMISSIONS,
  CUSTOMER_ADDRESS: CUSTOMER_ADDRESS_PERMISSIONS,
  CUSTOMER_FAVORITE: CUSTOMER_FAVORITE_PERMISSIONS,
  CUSTOMER_HISTORY: CUSTOMER_HISTORY_PERMISSIONS,
} as const;
