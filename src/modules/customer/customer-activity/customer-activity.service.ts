import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { PrismaService, BaseService, PaginationData } from '@gvray/core';



import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { QueryFavoriteDto } from './dto/query-favorite.dto';
import { FavoriteResponseDto } from './dto/favorite-response.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { HistoryResponseDto } from './dto/history-response.dto';

/**
 * 客户活动域服务：收藏 + 浏览历史。
 * 两类记录均为事件型（无 updatedAt），不调用 SoftDeleteService。
 * - 收藏：幂等 create（重复收藏返回原记录），remove 用 deleteMany（幂等）。
 * - 历史：upsert 语义（重复浏览更新 visitedAt），软删除用 update set deletedAt。
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
   * 收藏滤清器（幂等）：若已收藏返回原记录，否则新建。
   */
  async createFavorite(
    customerId: string,
    filterId: string,
  ): Promise<FavoriteResponseDto> {
    const existing = await this.prisma.customerFavorite.findUnique({
      where: { customerId_filterId: { customerId, filterId } },
    });
    if (existing) {
      return plainToInstance(FavoriteResponseDto, existing, {
        excludeExtraneousValues: true,
      });
    }
    const created = await this.prisma.customerFavorite.create({
      data: { customerId, filterId },
    });
    return plainToInstance(FavoriteResponseDto, created, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * 收藏列表分页查询。
   *
   * CustomerFavorite 为事件型表（spec 约定无软删除），不加 deletedAt 过滤。
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
      undefined,
      'createdAt',
    );
    return {
      ...result,
      items: plainToInstance(FavoriteResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * 按客户+滤清器取消收藏（幂等：deleteMany 不抛错）。
   */
  async removeFavorite(customerId: string, filterId: string): Promise<void> {
    await this.prisma.customerFavorite.deleteMany({
      where: { customerId, filterId },
    });
  }

  /**
   * 按 favoriteId 删除单条收藏（spec：事件型表，硬删）。
   * 仅限当前登录客户本人，跨客户收藏返回不存在。
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

  // ==================== 浏览历史 ====================

  /**
   * 记录一次浏览：upsert，重复浏览更新 visitedAt，不新建记录。
   * 注意：本方法由滤清器详情查看流程内部调用，不暴露为公开接口。
   */
  async recordView(customerId: string, filterId: string): Promise<void> {
    await this.prisma.customerHistory.upsert({
      where: { customerId_filterId: { customerId, filterId } },
      create: { customerId, filterId, visitedAt: new Date() },
      update: { visitedAt: new Date() },
    });
  }

  /**
   * 浏览历史分页查询，按 visitedAt 倒序，每条含滤清器快照。
   *
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
      { filter: { select: { model: true, gencode: true, typeName: true } } },
      'visitedAt',
    );
    return {
      ...result,
      items: plainToInstance(HistoryResponseDto, result.items, {
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
}
