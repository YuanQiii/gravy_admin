import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, PaginationData } from '@gvray/core';
import {
  assertFilterBrowseable,
  ACTIVE_FILTER_WHERE,
} from '@gvray/domain';



import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { QueryFavoriteDto } from './dto/query-favorite.dto';
import { FavoriteResponseDto } from './dto/favorite-response.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { HistoryResponseDto } from './dto/history-response.dto';

/** `findFavorites` 投影滤清器快照后的行结构（filter 为 include 关联返回）。 */
type FavoriteWithFilter = {
  id: number;
  favoriteId: string;
  customerId: string;
  filterId: string;
  createdAt: Date;
  filterAvailable?: boolean;
  filter?: {
    model: string;
    gencode: string;
    typeName: string;
    photoUuid?: string | null;
    status: string;
    deletedAt: Date | null;
  } | null;
};

/** `findHistory` 投影滤清器快照后的行结构（filter 为 include 关联返回）。 */
type HistoryWithFilter = {
  id: number;
  historyId: string;
  customerId: string;
  filterId: string;
  visitedAt: Date;
  createdAt: Date;
  filterAvailable?: boolean;
  filter?: {
    model: string;
    gencode: string;
    typeName: string;
    photoUuid?: string | null;
    status: string;
    deletedAt: Date | null;
  } | null;
};

/** 浏览历史每客户保留上限：写入事务内淘汰（按 visitedAt desc 跳过前 HISTORY_LIMIT 条后硬删最旧）。 */
const HISTORY_LIMIT = 100;

/**
 * 客户活动域服务：收藏 + 浏览历史。
 * 两类记录均为事件型（无 updatedAt），不调用 SoftDeleteService。
 * - 收藏：幂等 create（重复收藏返回原记录），remove 用 deleteMany（幂等）。
 * - 历史：upsert 语义（重复浏览更新 visitedAt），单条/清空均为硬删（无软删列）；
 *   每客户保留 HISTORY_LIMIT 条，写入事务内淘汰最旧。
 */
@Injectable()
export class CustomerActivityService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
  ) {
    super(prisma, configService);
  }

  // ==================== 收藏 ====================

  /**
   * 收藏滤清器（并发安全幂等）：若已收藏返回原记录，否则校验可用后新建。
   *
   * 存在则返回 / 不存在则校验并插入，折叠进**同一事务**；并发重复提交时后到的
   * create 撞 `@@unique([customerId, filterId])`（P2002），捕获后回查既存并返回，
   * 使「重复收藏返回原记录」在并发下也成立。
   *
   * 可用性门禁：写入前在同一事务内校验目标滤清器对客户可用（存在 + enabled +
   * 未软删），与浏览可见性共用 `@gvray/domain` 单一谓词 `assertFilterBrowseable`；
   * 不可用即 400 `FILTER_NOT_AVAILABLE`。（孤儿行已由原生外键 + Cascade 兜底，
   * 此校验定位为「当前可用性门禁」而非孤儿预防。）
   */
  async createFavorite(
    customerId: string,
    filterId: string,
  ): Promise<FavoriteResponseDto> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const browseable = await assertFilterBrowseable(tx, filterId);
        if (!browseable) {
          throw new BadRequestException('FILTER_NOT_AVAILABLE');
        }
        return tx.customerFavorite.create({ data: { customerId, filterId } });
      });
      return plainToInstance(FavoriteResponseDto, created, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const existing = await this.prisma.customerFavorite.findUnique({
          where: { customerId_filterId: { customerId, filterId } },
        });
        if (existing) {
          return plainToInstance(FavoriteResponseDto, existing, {
            excludeExtraneousValues: true,
          });
        }
      }
      throw err;
    }
  }

  /**
   * 收藏列表分页查询，投影滤清器当前快照并派生 `filterAvailable`。
   *
   * - `filterAvailable`：沿用 `ACTIVE_FILTER_WHERE`（存在 + enabled + 未软删）判定，
   *   供前端置灰失效收藏；滤清器失效时记录仍返回其最后快照，不斜漏（不加查询侧过滤）。
   * - CustomerFavorite 为事件型表（spec 约定无软删除），不加 deletedAt 过滤；
   *   排序沿用分页默认（createdAt 降序，前端可 `sortBy` 覆盖）。
   */
  async findFavorites(
    query: QueryFavoriteDto,
  ): Promise<PaginationData<FavoriteResponseDto>> {
    const where: Record<string, unknown> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.filterId) where.filterId = query.filterId;

    const result = await this.paginateWithSort(
      this.prisma.customerFavorite,
      query,
      where,
      {
        filter: {
          select: {
            model: true,
            gencode: true,
            typeName: true,
            photoUuid: true,
            status: true,
            deletedAt: true,
          },
        },
      },
      'createdAt',
    );
    const items = result.items.map((row) => {
      const fav = row as FavoriteWithFilter;
      const f = fav.filter;
      return {
        ...fav,
        filter: f
          ? {
              model: f.model,
              gencode: f.gencode,
              typeName: f.typeName,
              photoUuid: f.photoUuid ?? null,
            }
          : undefined,
        filterAvailable:
          !!f &&
          f.status === ACTIVE_FILTER_WHERE.status &&
          f.deletedAt == null,
      };
    });
    return {
      ...result,
      items: plainToInstance(FavoriteResponseDto, items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * 按 favoriteId 删除单条收藏（spec：事件型表，硬删）。
   * 仅限当前登录客户本人，跨客户或不存在返回 404。
   */
  async removeFavoriteById(favoriteId: string, customerId: string): Promise<void> {
    const existing = await this.prisma.customerFavorite.findFirst({
      where: { favoriteId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('收藏不存在');
    }
    await this.prisma.customerFavorite.delete({ where: { favoriteId } });
  }

  /**
   * 是否为 Prisma 唯一约束冲突（P2002）。用于 `createFavorite` 并发幂等的回查兜底。
   */
  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }

  // ==================== 浏览历史 ====================

  /**
   * 记录一次浏览：upsert，重复浏览更新 visitedAt，不新建记录。
   *
   * 调用不变量：**仅允许在滤清器可见性校验（存在 + enabled + 未软删）成功后调用**，
   * 本方法不自做可用性校验（前置门禁已由调用方保证）。由滤清器详情查看流程
   * （`FilterDetailFlow.viewFilterDetail`）内部调用，不暴露为公开接口。
   *
   * 同一事务内执行保留上限淘汰：写入后按 `(customerId, visitedAt)` 取该客户第
   * `HISTORY_LIMIT` 条之后的记录并硬删，保证每客户历史 ≤ HISTORY_LIMIT。
   */
  async recordView(customerId: string, filterId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.customerHistory.upsert({
        where: { customerId_filterId: { customerId, filterId } },
        create: { customerId, filterId, visitedAt: new Date() },
        update: { visitedAt: new Date() },
      });
      const overflow = await tx.customerHistory.findMany({
        where: { customerId },
        select: { historyId: true },
        orderBy: { visitedAt: 'desc' },
        skip: HISTORY_LIMIT,
      });
      if (overflow.length > 0) {
        await tx.customerHistory.deleteMany({
          where: {
            customerId,
            historyId: { in: overflow.map((r) => r.historyId) },
          },
        });
      }
    });
  }

  /**
   * 浏览历史分页查询，按 visitedAt 倒序，每条含滤清器快照与派生 `filterAvailable`。
   *
   * 快照字段集与收藏对齐（model/gencode/typeName/photoUuid），并派生 `filterAvailable`，
   * 供前端置灰失效历史；已失效滤清器仍按其最后快照返回，不静默丢失。
   * CustomerHistory 为事件型表（spec 约定无软删除），不加 deletedAt 过滤。
   */
  async findHistory(
    query: QueryHistoryDto,
  ): Promise<PaginationData<HistoryResponseDto>> {
    const where: Record<string, unknown> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.filterId) where.filterId = query.filterId;

    const result = await this.paginateWithSort(
      this.prisma.customerHistory,
      query,
      where,
      {
        filter: {
          select: {
            model: true,
            gencode: true,
            typeName: true,
            photoUuid: true,
            status: true,
            deletedAt: true,
          },
        },
      },
      'visitedAt',
    );
    const items = result.items.map((row) => {
      const h = row as HistoryWithFilter;
      const f = h.filter;
      return {
        ...h,
        filter: f
          ? {
              model: f.model,
              gencode: f.gencode,
              typeName: f.typeName,
              photoUuid: f.photoUuid ?? null,
            }
          : undefined,
        filterAvailable:
          !!f &&
          f.status === ACTIVE_FILTER_WHERE.status &&
          f.deletedAt == null,
      };
    });
    return {
      ...result,
      items: plainToInstance(HistoryResponseDto, items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * 硬删单条浏览历史（spec：事件型表，硬删）。
   * 仅限当前登录客户本人，跨客户历史返回不存在。
   */
  async removeHistory(historyId: string, customerId: string): Promise<void> {
    const existing = await this.prisma.customerHistory.findFirst({
      where: { historyId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('浏览历史不存在');
    }
    await this.prisma.customerHistory.delete({ where: { historyId } });
  }

  /**
   * 清空当前客户全部浏览历史（硬删）。
   * 返回删除条数；空历史返回 `{ deleted: 0 }`，不抛 404（幂等语义）。
   */
  async clearAllHistory(customerId: string): Promise<{ deleted: number }> {
    const { count } = await this.prisma.customerHistory.deleteMany({
      where: { customerId },
    });
    return { deleted: count };
  }
}
