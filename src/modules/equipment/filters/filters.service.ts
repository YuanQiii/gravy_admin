import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BaseService } from '@/shared/services/base.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { PaginationData } from '@/shared/interfaces/response.interface';
import { CreateFilterDto } from './dto/create-filter.dto';
import { UpdateFilterDto } from './dto/update-filter.dto';
import { QueryFilterDto } from './dto/query-filter.dto';
import { FilterResponseDto } from './dto/filter-response.dto';

/**
 * 滤清器-字段错误码前缀映射，用于 P2002 兜底时按 meta.target 选前缀。
 */
const FILTER_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  model: 'EQUIPMENT_FILTER_MODEL',
  gencode: 'EQUIPMENT_FILTER_GENCODE',
};

@Injectable()
export class FiltersService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateFilterDto,
    createdById?: string,
  ): Promise<FilterResponseDto> {
    await this.validateFilterType(dto.typeName);

    await this.softDelete.assertUniqueActive(
      this.prisma.filter,
      'model',
      dto.model,
      { errorPrefix: 'EQUIPMENT_FILTER_MODEL' },
    );
    if (dto.gencode) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filter,
        'gencode',
        dto.gencode,
        { errorPrefix: 'EQUIPMENT_FILTER_GENCODE' },
      );
    }

    const { compatibility, ...rest } = dto;
    const data: Prisma.FilterUncheckedCreateInput = {
      ...rest,
      createdById: createdById ?? null,
    };
    if (compatibility !== undefined) {
      data.compatibility = compatibility as Prisma.InputJsonValue;
    }

    try {
      const filter = await this.prisma.filter.create({ data });
      return plainToInstance(FilterResponseDto, filter, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryFilterDto,
  ): Promise<PaginationData<FilterResponseDto>> {
    const where: Prisma.FilterWhereInput = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { model: { contains: query.keyword, mode: 'insensitive' } },
        { gencode: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.typeName) {
      where.typeName = query.typeName;
    }
    if (query.status) {
      where.status = query.status;
    }

    const result = await this.paginateWithSort(
      this.prisma.filter,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(FilterResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(filterId: string): Promise<FilterResponseDto> {
    const filter = await this.prisma.filter.findUnique({
      where: { filterId },
    });
    if (!filter || filter.deletedAt) {
      throw new NotFoundException('滤清器不存在');
    }
    return plainToInstance(FilterResponseDto, filter, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    filterId: string,
    dto: UpdateFilterDto,
    updatedById?: string,
  ): Promise<FilterResponseDto> {
    const existing = await this.prisma.filter.findUnique({
      where: { filterId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('滤清器不存在');
    }

    if (dto.typeName && dto.typeName !== existing.typeName) {
      await this.validateFilterType(dto.typeName);
    }
    if (dto.model && dto.model !== existing.model) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filter,
        'model',
        dto.model,
        {
          errorPrefix: 'EQUIPMENT_FILTER_MODEL',
          excludeIdField: 'filterId',
          excludeIdValue: filterId,
        },
      );
    }
    if (dto.gencode && dto.gencode !== existing.gencode) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filter,
        'gencode',
        dto.gencode,
        {
          errorPrefix: 'EQUIPMENT_FILTER_GENCODE',
          excludeIdField: 'filterId',
          excludeIdValue: filterId,
        },
      );
    }

    try {
      const filter = await this.prisma.filter.update({
        where: { filterId },
        data: { ...dto, updatedById: updatedById ?? null },
      });
      return plainToInstance(FilterResponseDto, filter, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(filterId: string): Promise<void> {
    const existing = await this.prisma.filter.findUnique({
      where: { filterId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('滤清器不存在');
    }
    await this.softDelete.softDelete(this.prisma.filter, 'filterId', filterId);
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.filter.updateMany({
      where: { filterId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 校验 typeName 是否存在于 FilterType 启用列表中。
   */
  private async validateFilterType(typeName: string): Promise<void> {
    const filterType = await this.prisma.filterType.findFirst({
      where: { code: typeName, status: 'enabled', deletedAt: null },
    });
    if (!filterType) {
      throw new BadRequestException('EQUIPMENT_FILTER_TYPE_INVALID');
    }
  }

  /**
   * P2002 兜底：按 error.meta.target 选择对应字段前缀；无法识别时退回 MODEL。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      const field = target.find((t) => FILTER_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? FILTER_UNIQUE_PREFIX_BY_FIELD[field]
        : 'EQUIPMENT_FILTER_MODEL';
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
