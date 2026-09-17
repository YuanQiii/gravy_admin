/**
 * `@gvray/core` 唯一公开导入面。
 *
 * 仅通过本文件对外暴露公共构件；模块内部实现不对外可见。
 * 详见 AGENTS.md 与迁移 ADR。
 */

// ── prisma ───────────────────────────────────────────────────────
export { PrismaModule } from './prisma/prisma.module';
export { PrismaService } from './prisma/prisma.service';

// ── redis ────────────────────────────────────────────────────────
export { RedisModule } from './redis/redis.module';
export { RedisService, RedisUnavailableError } from './redis/redis.service';
export { RateLimiterService } from './redis/rate-limiter.service';
export { PermissionCacheService } from './redis/permission-cache.service';
export { RedisKeys } from './redis/constants/redis-key.constant';
export { CacheService } from './redis/cache.service';
export { CacheableExplorer } from './redis/cacheable.explorer';
export { Cacheable } from './redis/decorators/cacheable.decorator';
export { CacheEvict } from './redis/decorators/cache-evict.decorator';
export { LockService, LockAcquireError } from './redis/lock.service';

// ── core / session ───────────────────────────────────────────────
export {
  SessionStore,
  SessionMeta,
  SessionVerifyResult,
  StoredSession,
} from './core/session/session-store.service';

// ── core / auth realm ────────────────────────────────────────────
export {
  AUTH_REALMS,
  AuthRealm,
  AUTH_REALM_USER,
  AUTH_REALM_CUSTOMER,
  isCustomerRealm,
} from './core/constants/auth-realm.constant';

// ── core / guards ────────────────────────────────────────────────
export { JwtAuthGuard } from './core/guards/jwt-auth.guard';
export { RolesGuard } from './core/guards/roles.guard';
export { PermissionsGuard } from './core/guards/permissions.guard';
export { AccessGuard } from './core/guards/access.guard';
export { GuestWriteGuard } from './core/guards/guest-write.guard';
// 注：FeatureFlagGuard 依赖 @/modules/system/configs/configs.service（src 应用模块），
// 而 ConfigsService 又经本 barrel 返回引用。为避免 barrel 加载期的循环依赖（jest 与
// 运行时均会在 extends BaseService 处取到 undefined），将其 re-export 放在文件末尾。

// ── core / decorators ────────────────────────────────────────────
export { Public } from './core/decorators/public.decorator';
export { CurrentUser } from './core/decorators/current-user.decorator';
export { RequirePermissions, PERMISSIONS_KEY } from './core/decorators/permissions.decorator';
export { Roles } from './core/decorators/roles.decorator';
export { OperationLog } from './core/decorators/operation-log.decorator';
export { NoOperationLog } from './core/decorators/no-operation-log.decorator';
export { SkipResponseFormat } from './core/decorators/skip-response-format.decorator';
export { FeatureFlag } from './core/decorators/feature-flag.decorator';
export { AllowGuestWrite } from './core/decorators/allow-guest-write.decorator';

// ── core / interceptors ──────────────────────────────────────────
// 注：SessionHeartbeatInterceptor 依赖 admin 的 TokenService，属 admin 侧横切，
// 已迁至 apps/admin/src/core/interceptors/（不占用 @gvray/core barrel 面）。
export { ResponseInterceptor } from './core/interceptors/response.interceptor';
export { OperationLogInterceptor } from './core/interceptors/operation-log.interceptor';

// ── core / filters ───────────────────────────────────────────────
export { HttpExceptionFilter } from './core/filters/http-exception.filter';

// ── core / pipes ─────────────────────────────────────────────────
export { EmptyStringTransformPipe } from './core/pipes/empty-string-transform.pipe';

// ── core / interfaces ────────────────────────────────────────────
export { IUser } from './core/interfaces/user.interface';
export { IRole } from './core/interfaces/role.interface';

// ── core / strategies ────────────────────────────────────────────
export { JwtStrategy } from './core/strategies/jwt.strategy';

// ── shared / utils ───────────────────────────────────────────────
export { ResponseUtil } from './shared/utils/response.util';
export { extractPermissionCodes, extractRoleKeys, isSuperAdminOf } from './shared/utils/permission.util';
export { startOfDay, endOfDay } from './shared/utils/time.util';
export { resolveClientIp } from './shared/utils/client-ip.util';

// ── shared / services ────────────────────────────────────────────
export { BaseService, VisibilityOpts, isB2cVisibility } from './shared/services/base.service';
export { SoftDeleteService } from './shared/services/soft-delete.service';
export { SoftDeleteModule } from './shared/services/soft-delete.module';

// ── shared / constants ───────────────────────────────────────────
export { CommonStatus } from './shared/constants/common-status.constant';
export { UserStatus } from './shared/constants/user-status.constant';
export { Gender } from './shared/constants/gender.constant';
export { LogResult } from './shared/constants/log-result.constant';
export { SENSITIVE_KEYS, buildRedactPaths } from './shared/constants/sensitive-keys.constant';
export { SUPER_ROLE_KEY, SUPER_ROLE_NAME, ADMIN_ROLE_KEY, GUEST_ROLE_KEY } from './shared/constants/role.constant';
export {
  USER_PERMISSIONS,
  ROLE_PERMISSIONS,
  CUSTOMER_PERMISSIONS,
  PERMISSION_METADATA_MAP,
  PERMISSION_PERMISSIONS,
  DEPARTMENT_PERMISSIONS,
  POSITION_PERMISSIONS,
  DICTIONARY_PERMISSIONS,
  CONFIG_PERMISSIONS,
  MENU_PERMISSIONS,
  LOGIN_LOG_PERMISSIONS,
  OPERATION_LOG_PERMISSIONS,
  ONLINE_USER_PERMISSIONS,
  MONITOR_PERMISSIONS,
  CACHE_PERMISSIONS,
  NOTICE_PERMISSIONS,
  EQUIPMENT_BRAND_PERMISSIONS,
  EQUIPMENT_HOT_BRAND_PERMISSIONS,
  EQUIPMENT_CATALOG_PERMISSIONS,
  EQUIPMENT_FILTER_TYPE_PERMISSIONS,
  EQUIPMENT_FILTER_PERMISSIONS,
  EQUIPMENT_PERMISSIONS,
  INQUIRY_PERMISSIONS,
  INQUIRY_LINE_PERMISSIONS,
  CUSTOMER_ADDRESS_PERMISSIONS,
  PERMISSIONS,
} from './shared/constants/permissions.constant';
export {
  INQUIRY_STATUS,
  InquiryStatus,
  INQUIRY_STATUS_VALUES,
  INQUIRY_STATUS_TRANSITIONS,
  isValidStatusTransition,
  buildStatusPatch,
  isInquiryExpired,
  INQUIRY_NO_PREFIX,
  INQUIRY_NO_FORMAT,
  INQUIRY_NO_SEQ_LENGTH,
} from './shared/constants/inquiry.constant';
export {
  EQUIPMENT_ENGINE_ENERGY,
  EquipmentEngineEnergy,
  isEquipmentEngineEnergy,
  EQUIPMENT_STATUS,
  EquipmentStatus,
} from './shared/constants/equipment.constant';
export {
  CUSTOMER_STATUS,
  CustomerStatus,
} from './shared/constants/customer.constant';

// ── shared / dtos ────────────────────────────────────────────────
export { PaginationDto, PaginationSortDto } from './shared/dtos/pagination.dto';
export {
  SelfPagedQueryDto,
  SelfFilterableQueryDto,
} from './shared/dtos/self-query.dto';
export {
  IsAllowedSortByConstraint,
  SortWhitelist,
} from './shared/validators/is-allowed-sort-by.validator';

// ── shared / interfaces ──────────────────────────────────────────
export { PaginationData } from './shared/interfaces/response.interface';

// ── logging ──────────────────────────────────────────────────────
export { LoggingModule } from './logging/logging.module';
export { RequestLogInterceptor } from './logging/request-log.interceptor';
export { REQUEST_ID_PROP } from './logging/logging.constants';
export { RequestIdMiddleware } from './logging/request-id.middleware';

// ── bootstrap ────────────────────────────────────────────────────
export { configureApp } from './bootstrap/configure-app';
export {
  bootstrapDatabase,
  BootstrapDeps,
  BootstrapResult,
  NoMigrationsError,
} from './bootstrap/bootstrap';
export {
  DriftReport,
  verifyNoDrift,
  generateBaseline,
  prismaRun,
  defaultMigrationsRoot,
} from './bootstrap/baseline';

// ── config ────────────────────────────────────────────────────────
export { default as appConfig } from './config/app.config';
export { AppConfig } from './config/app.config';
export { default as corsConfig } from './config/cors.config';
export { CorsConfig } from './config/cors.config';
export { default as databaseConfig } from './config/database.config';
export { DatabaseConfig } from './config/database.config';
export { default as jwtConfig } from './config/jwt.config';
export { JwtConfig } from './config/jwt.config';
export { default as redisConfig } from './config/redis.config';
export { RedisConfig } from './config/redis.config';
export { validate as validateEnv } from './config/env.validation';

// ── core / guards（依赖 src 应用模块，置于文件末尾避免循环初始化）──
//  FeatureFlagGuard 已移至 apps/admin/src/core/guards (admin-only crosscutting), 不从此 barrel 导出。
// 依赖 admin ConfigsService 才能工作，mall-app 挂载不导入。
export { FEATURE_FLAG_KEY, FeatureFlagOptions } from './core/decorators/feature-flag.decorator';