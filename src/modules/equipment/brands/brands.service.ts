import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BaseService } from '@/shared/services/base.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { PaginationData } from '@/shared/interfaces/response.interface';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { QueryBrandDto } from './dto/query-brand.dto';
import { BrandResponseDto } from './dto/brand-response.dto';

/**
 * 品牌-字段错误码前缀映射，用于 P2002 兜底时按 meta.target 选前缀。
 */
const BRAND_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  name: 'EQUIPMENT_BRAND_NAME',
  slug: 'EQUIPMENT_BRAND_SLUG',
};

@Injectable()
export class BrandsService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateBrandDto,
    createdById?: string,
  ): Promise<BrandResponseDto> {
    await this.softDelete.assertUniqueActive(
      this.prisma.equipmentBrand,
      'name',
      dto.name,
      { errorPrefix: 'EQUIPMENT_BRAND_NAME' },
    );
    if (dto.slug) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentBrand,
        'slug',
        dto.slug,
        { errorPrefix: 'EQUIPMENT_BRAND_SLUG' },
      );
    }

    try {
      const brand = await this.prisma.equipmentBrand.create({
        data: { ...dto, createdById: createdById ?? null },
      });
      return plainToInstance(BrandResponseDto, brand, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryBrandDto,
  ): Promise<PaginationData<BrandResponseDto>> {
    const where = this.buildWhere({
      contains: { name: query.name },
      equals: { status: query.status, slug: query.slug },
    });
    where.deletedAt = null;

    const result = await this.paginateWithSort(
      this.prisma.equipmentBrand,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(BrandResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(brandId: string): Promise<BrandResponseDto> {
    const brand = await this.prisma.equipmentBrand.findUnique({
      where: { brandId },
    });
    if (!brand || brand.deletedAt) {
      throw new NotFoundException('品牌不存在');
    }
    return plainToInstance(BrandResponseDto, brand, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    brandId: string,
    dto: UpdateBrandDto,
    updatedById?: string,
  ): Promise<BrandResponseDto> {
    const existing = await this.prisma.equipmentBrand.findUnique({
      where: { brandId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('品牌不存在');
    }

    if (dto.name && dto.name !== existing.name) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentBrand,
        'name',
        dto.name,
        {
          errorPrefix: 'EQUIPMENT_BRAND_NAME',
          excludeIdField: 'brandId',
          excludeIdValue: brandId,
        },
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentBrand,
        'slug',
        dto.slug,
        {
          errorPrefix: 'EQUIPMENT_BRAND_SLUG',
          excludeIdField: 'brandId',
          excludeIdValue: brandId,
        },
      );
    }

    try {
      const brand = await this.prisma.equipmentBrand.update({
        where: { brandId },
        data: { ...dto, updatedById: updatedById ?? null },
      });
      return plainToInstance(BrandResponseDto, brand, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(brandId: string): Promise<void> {
    const existing = await this.prisma.equipmentBrand.findUnique({
      where: { brandId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('品牌不存在');
    }
    await this.softDelete.softDelete(
      this.prisma.equipmentBrand,
      'brandId',
      brandId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.equipmentBrand.updateMany({
      where: { brandId: { in: ids }, deletedAt: null },
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
      const field = target.find((t) => BRAND_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? BRAND_UNIQUE_PREFIX_BY_FIELD[field]
        : 'EQUIPMENT_BRAND_NAME';
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
