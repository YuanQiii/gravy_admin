import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * 软删除与唯一性校验集中服务（架构深化，详见 ADR 0003）
 *
 * 深 module：3 方法 interface 藏起软删除 + 唯一性冲突诊断 + P2002 兜底的全部复杂度。
 * 9 个业务 service 注入调用，避免逐字复制软删除逻辑。
 *
 * 仅服务有 `deletedAt` 字段的 model。事件型表（equipment_filters/favorites/history）不调用。
 */
@Injectable()
export class SoftDeleteService {
  /** 错误码后缀私有常量（命名规则从约定变代码） */
  private static readonly SUFFIX_DUPLICATED = '_DUPLICATED';
  private static readonly SUFFIX_DUPLICATED_SOFT_DELETED =
    '_DUPLICATED_SOFT_DELETED';

  /** Prisma 唯一约束冲突错误码 */
  private static readonly PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验某字段值在未软删除记录中唯一，并诊断软删除占用情况
   *
   * - 未软删除记录命中 → 抛 ConflictException({errorPrefix}_DUPLICATED)
   * - 仅软删除记录命中 → 抛 ConflictException({errorPrefix}_DUPLICATED_SOFT_DELETED)
   * - 都未命中 → 不抛错
   *
   * 更新场景传 excludeIdField/excludeIdValue 排除自身。
   *
   * 注意：本方法不查并发安全，DB 唯一约束是最后防线。create 时若 TOCTOU 窗口内撞活跃记录，
   * 调用方应 catch P2002 并用 handleUniqueError 兜底转译。
   *
   * @param model Prisma model delegate
   * @param field 待校验唯一性的字段名（如 'name'）
   * @param value 字段值
   * @param opts.errorPrefix 错误码前缀（如 'EQUIPMENT_BRAND_NAME'），Service 拼后缀
   * @param opts.excludeIdField 更新时排除自身的 ID 字段名（如 'brandId'）
   * @param opts.excludeIdValue 更新时排除自身的 ID 值
   */
  async assertUniqueActive(
    model: {
      findFirst: (args: {
        where?: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) => Promise<{ id?: string | number } | null>;
    },
    field: string,
    value: string,
    opts: {
      errorPrefix: string;
      excludeIdField?: string;
      excludeIdValue?: string;
    },
  ): Promise<void> {
    const baseWhere: Record<string, unknown> = { [field]: value };
    if (opts.excludeIdField && opts.excludeIdValue) {
      baseWhere.NOT = { [opts.excludeIdField]: opts.excludeIdValue };
    }

    // 1. 查未软删除记录
    const activeConflict = await model.findFirst({
      where: { ...baseWhere, deletedAt: null },
      select: { id: true },
    });
    if (activeConflict) {
      throw new ConflictException(
        `${opts.errorPrefix}${SoftDeleteService.SUFFIX_DUPLICATED}`,
      );
    }

    // 2. 查软删除记录
    const softDeletedConflict = await model.findFirst({
      where: { ...baseWhere, deletedAt: { not: null } },
      select: { id: true },
    });
    if (softDeletedConflict) {
      throw new ConflictException(
        `${opts.errorPrefix}${SoftDeleteService.SUFFIX_DUPLICATED_SOFT_DELETED}`,
      );
    }
  }

  /**
   * 软删除：设 deletedAt = now()
   * @param model Prisma model delegate
   * @param idField 业务 ID 字段名（如 brandId/customerId）
   * @param id 业务 ID 值
   */
  async softDelete(
    model: {
      update: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => Promise<unknown>;
    },
    idField: string,
    id: string,
  ): Promise<void> {
    await model.update({
      where: { [idField]: id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 处理 Prisma 唯一约束冲突（P2002）
   *
   * - P2002 → 抛 ConflictException({errorPrefix}_DUPLICATED)
   * - 非 P2002 → 透传原错误
   *
   * 调用方在 create 时用 try/catch 包裹，catch 后调本方法兜底。
   */
  handleUniqueError(error: unknown, errorPrefix: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === SoftDeleteService.PRISMA_UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new ConflictException(
        `${errorPrefix}${SoftDeleteService.SUFFIX_DUPLICATED}`,
      );
    }
    throw error;
  }
}
