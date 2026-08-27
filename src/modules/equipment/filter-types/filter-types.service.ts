import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BaseService, VisibilityOpts } from '@/shared/services/base.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { PaginationData } from '@/shared/interfaces/response.interface';
import { CreateFilterTypeDto } from './dto/create-filter-type.dto';
import { UpdateFilterTypeDto } from './dto/update-filter-type.dto';
import { QueryFilterTypeDto } from './dto/query-filter-type.dto';
import { FilterTypeResponseDto } from './dto/filter-type-response.dto';

/**
 * 滤清器类型-字段错误码前缀映射，用于 P2002 兜底时按 meta.target 选前缀。
 */
const FILTER_TYPE_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  name: 'EQUIPMENT_FILTER_TYPE_NAME',
  code: 'EQUIPMENT_FILTER_TYPE_CODE',
};

@Injectable()
export class FilterTypesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateFilterTypeDto,
    createdById?: string,
  ): Promise<FilterTypeResponseDto> {
    await this.softDelete.assertUniqueActive(
      this.prisma.filterType,
      'name',
      dto.name,
      { errorPrefix: 'EQUIPMENT_FILTER_TYPE_NAME' },
    );
    await this.softDelete.assertUniqueActive(
      this.prisma.filterType,
      'code',
      dto.code,
      { errorPrefix: 'EQUIPMENT_FILTER_TYPE_CODE' },
    );

    try {
      const filterType = await this.prisma.filterType.create({
        data: { ...dto, createdById: createdById ?? null },
      });
      return plainToInstance(FilterTypeResponseDto, filterType, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryFilterTypeDto,
    opts?: VisibilityOpts,
  ): Promise<PaginationData<FilterTypeResponseDto>> {
    const where = this.buildWhere({
      contains: { name: query.name },
      equals: { status: query.status, code: query.code },
    });
    where.deletedAt = null;
    this.applyVisibility(where, opts);

    const result = await this.paginateWithSort(
      this.prisma.filterType,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(FilterTypeResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(
    filterTypeId: string,
    opts?: VisibilityOpts,
  ): Promise<FilterTypeResponseDto> {
    const filterType = await this.prisma.filterType.findUnique({
      where: { filterTypeId },
    });
    if (!filterType || filterType.deletedAt) {
      throw new NotFoundException('滤清器类型不存在');
    }
    this.assertVisible(filterType, opts);
    return plainToInstance(FilterTypeResponseDto, filterType, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    filterTypeId: string,
    dto: UpdateFilterTypeDto,
    updatedById?: string,
  ): Promise<FilterTypeResponseDto> {
    const existing = await this.prisma.filterType.findUnique({
      where: { filterTypeId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('滤清器类型不存在');
    }

    if (dto.name && dto.name !== existing.name) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filterType,
        'name',
        dto.name,
        {
          errorPrefix: 'EQUIPMENT_FILTER_TYPE_NAME',
          excludeIdField: 'filterTypeId',
          excludeIdValue: filterTypeId,
        },
      );
    }
    if (dto.code && dto.code !== existing.code) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filterType,
        'code',
        dto.code,
        {
          errorPrefix: 'EQUIPMENT_FILTER_TYPE_CODE',
          excludeIdField: 'filterTypeId',
          excludeIdValue: filterTypeId,
        },
      );
    }

    try {
      const filterType = await this.prisma.filterType.update({
        where: { filterTypeId },
        data: { ...dto, updatedById: updatedById ?? null },
      });
      return plainToInstance(FilterTypeResponseDto, filterType, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(filterTypeId: string): Promise<void> {
    const existing = await this.prisma.filterType.findUnique({
      where: { filterTypeId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('滤清器类型不存在');
    }
    await this.softDelete.softDelete(
      this.prisma.filterType,
      'filterTypeId',
      filterTypeId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.filterType.updateMany({
      where: { filterTypeId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 获取启用状态的滤清器类型下拉选项。
   * 返回原始行，不做 DTO 转换，仅包含下拉所需字段。
   */
  async findAllEnabled() {
    return this.prisma.filterType.findMany({
      where: { status: 'enabled', deletedAt: null },
      select: { filterTypeId: true, name: true, code: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * P2002 兜底：按 error.meta.target 选择对应字段前缀；无法识别时退回 NAME。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      const field = target.find((t) => FILTER_TYPE_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? FILTER_TYPE_UNIQUE_PREFIX_BY_FIELD[field]
        : 'EQUIPMENT_FILTER_TYPE_NAME';
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
