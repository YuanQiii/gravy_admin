import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, VisibilityOpts, SoftDeleteService, PaginationData } from '@gvray/core';




import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { QueryBrandDto } from './dto/query-brand.dto';
import { BrandResponseDto } from './dto/brand-response.dto';
import { HotStatusBrandsDto } from './dto/hot-status-brands.dto';
import { HotBrandQueryDto } from './dto/hot-brand-query.dto';
import { HotBrandResponseDto } from './dto/hot-brand-response.dto';
import { rankHotBrands } from './hot-ranking';
import {
  HotBrandCandidateSource,
  SqlHotBrandCandidateSource,
} from './hot-candidate-source';

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
    private readonly hotCandidateSource: HotBrandCandidateSource,
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
    opts?: VisibilityOpts,
  ): Promise<PaginationData<BrandResponseDto>> {
    const where = this.buildWhere({
      contains: { name: query.name },
      equals: { status: query.status, slug: query.slug },
    });
    where.deletedAt = null;
    this.applyVisibility(where, opts);

    const result = await this.paginateWithSort(
      this.prisma.equipmentBrand,
      query,
      where,
      undefined,
    );
    return {
      ...result,
      items: plainToInstance(BrandResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(
    brandId: string,
    opts?: VisibilityOpts,
  ): Promise<BrandResponseDto> {
    const brand = await this.prisma.equipmentBrand.findUnique({
      where: { brandId },
    });
    if (!brand || brand.deletedAt) {
      throw new NotFoundException('品牌不存在');
    }
    this.assertVisible(brand, opts);
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
   * 配置热门品牌状态：对 `brandId in ids` 写 `isHot`（及可选 `hotOrder`）。
   * 单条与批量同接口，`ids=[id]` 表达单条。事务内批量更新，普通品牌更新
   * 接口不承载热门字段（见 controller）。
   */
  async updateHotStatus(dto: HotStatusBrandsDto): Promise<{ affected: number }> {
    const data: Prisma.EquipmentBrandUpdateManyMutationInput = {
      isHot: dto.isHot,
    };
    if (dto.hotOrder !== undefined) {
      data.hotOrder = dto.hotOrder;
    }

    const [result] = await this.prisma.$transaction([
      this.prisma.equipmentBrand.updateMany({
        where: {
          brandId: { in: dto.ids },
          deletedAt: null,
        },
        data,
      }),
    ]);
    return { affected: result.count };
  }

  /**
   * 公开热门品牌列表：候选品牌与生效设备数经 `HotBrandCandidateSource`
   * 取出（两段受限查询，候选量受 `HOT_BRAND_CANDIDATE_CAP` 约束——只截断
   * 候选量、不改对外结果），随后交由纯函数 rankHotBrands 合并排序。
   * 排序不变量只存在于 hot-ranking.ts，本方法不复述排序逻辑。
   */
  async findHot(query: HotBrandQueryDto): Promise<HotBrandResponseDto[]> {
    const limit = query.limit ?? 8;
    const anonymous: VisibilityOpts = { visibility: 'anonymous' };

    const { brands, deviceCounts } =
      await this.hotCandidateSource.fetchCandidates(anonymous);

    const ranked = rankHotBrands(brands, deviceCounts, limit);
    return plainToInstance(HotBrandResponseDto, ranked, {
      excludeExtraneousValues: true,
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
