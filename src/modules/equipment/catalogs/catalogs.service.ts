import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BaseService } from '@/shared/services/base.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { PaginationData } from '@/shared/interfaces/response.interface';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { CatalogResponseDto } from './dto/catalog-response.dto';

/**
 * 设备目录-字段错误码前缀映射，用于 P2002 兜底时按 meta.target 选前缀。
 */
const CATALOG_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  name: 'EQUIPMENT_CATALOG_NAME',
  code: 'EQUIPMENT_CATALOG_CODE',
};

@Injectable()
export class CatalogsService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateCatalogDto,
    createdById?: string,
  ): Promise<CatalogResponseDto> {
    await this.softDelete.assertUniqueActive(
      this.prisma.equipmentCatalog,
      'name',
      dto.name,
      { errorPrefix: 'EQUIPMENT_CATALOG_NAME' },
    );
    if (dto.code) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentCatalog,
        'code',
        dto.code,
        { errorPrefix: 'EQUIPMENT_CATALOG_CODE' },
      );
    }

    try {
      const catalog = await this.prisma.equipmentCatalog.create({
        data: { ...dto, createdById: createdById ?? null },
      });
      return plainToInstance(CatalogResponseDto, catalog, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryCatalogDto,
  ): Promise<PaginationData<CatalogResponseDto>> {
    const where = this.buildWhere({
      contains: { name: query.name },
      equals: { status: query.status, code: query.code },
    });
    where.deletedAt = null;

    const result = await this.paginateWithSort(
      this.prisma.equipmentCatalog,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(CatalogResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(catalogId: string): Promise<CatalogResponseDto> {
    const catalog = await this.prisma.equipmentCatalog.findUnique({
      where: { catalogId },
    });
    if (!catalog || catalog.deletedAt) {
      throw new NotFoundException('目录不存在');
    }
    return plainToInstance(CatalogResponseDto, catalog, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    catalogId: string,
    dto: UpdateCatalogDto,
    updatedById?: string,
  ): Promise<CatalogResponseDto> {
    const existing = await this.prisma.equipmentCatalog.findUnique({
      where: { catalogId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('目录不存在');
    }

    if (dto.name && dto.name !== existing.name) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentCatalog,
        'name',
        dto.name,
        {
          errorPrefix: 'EQUIPMENT_CATALOG_NAME',
          excludeIdField: 'catalogId',
          excludeIdValue: catalogId,
        },
      );
    }
    if (dto.code && dto.code !== existing.code) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentCatalog,
        'code',
        dto.code,
        {
          errorPrefix: 'EQUIPMENT_CATALOG_CODE',
          excludeIdField: 'catalogId',
          excludeIdValue: catalogId,
        },
      );
    }

    try {
      const catalog = await this.prisma.equipmentCatalog.update({
        where: { catalogId },
        data: { ...dto, updatedById: updatedById ?? null },
      });
      return plainToInstance(CatalogResponseDto, catalog, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(catalogId: string): Promise<void> {
    const existing = await this.prisma.equipmentCatalog.findUnique({
      where: { catalogId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('目录不存在');
    }
    await this.softDelete.softDelete(
      this.prisma.equipmentCatalog,
      'catalogId',
      catalogId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.equipmentCatalog.updateMany({
      where: { catalogId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
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
      const field = target.find((t) => CATALOG_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? CATALOG_UNIQUE_PREFIX_BY_FIELD[field]
        : 'EQUIPMENT_CATALOG_NAME';
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
