import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma, Filter } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BaseService } from '@/shared/services/base.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { PaginationData } from '@/shared/interfaces/response.interface';
import { isEquipmentEngineEnergy } from '@/shared/constants/equipment.constant';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { QueryEquipmentDto } from './dto/query-equipment.dto';
import { EquipmentResponseDto } from './dto/equipment-response.dto';

/**
 * 设备档案错误码前缀（复合唯一约束 [brandName, model] 兜底）。
 */
const EQUIPMENT_UNIQUE_PREFIX = 'EQUIPMENT_EQUIPMENT';

@Injectable()
export class EquipmentService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateEquipmentDto,
    createdById?: string,
  ): Promise<EquipmentResponseDto> {
    if (dto.engineEnergy && !isEquipmentEngineEnergy(dto.engineEnergy)) {
      throw new BadRequestException('EQUIPMENT_EQUIPMENT_ENGINE_ENERGY_INVALID');
    }

    const brandName = await this.resolveBrandNameForCreate(
      dto.brandId,
      dto.brandName,
    );
    const catalogName = await this.resolveCatalogNameForCreate(
      dto.catalogId,
      dto.catalogName,
    );

    await this.assertCompositeUnique(brandName, dto.model);

    const {
      brandName: _ignoredBrandName,
      catalogName: _ignoredCatalogName,
      productionDateStart: rawStart,
      productionDateEnd: rawEnd,
      ...rest
    } = dto;

    try {
      const equipment = await this.prisma.equipment.create({
        data: {
          ...rest,
          brandName,
          catalogName,
          productionDateStart: rawStart ? new Date(rawStart) : null,
          productionDateEnd: rawEnd ? new Date(rawEnd) : null,
          createdById: createdById ?? null,
        },
      });
      return plainToInstance(EquipmentResponseDto, equipment, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryEquipmentDto,
  ): Promise<PaginationData<EquipmentResponseDto>> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { model: { contains: query.keyword, mode: 'insensitive' } },
        { brandName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.brandId) where.brandId = query.brandId;
    if (query.catalogId) where.catalogId = query.catalogId;
    if (query.engineEnergy) where.engineEnergy = query.engineEnergy;
    if (query.status) where.status = query.status;

    const result = await this.paginateWithSort(
      this.prisma.equipment,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(EquipmentResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(equipmentId: string): Promise<EquipmentResponseDto> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { equipmentId },
      include: { equipmentFilters: { include: { filter: true } } },
    });
    if (!equipment || equipment.deletedAt) {
      throw new NotFoundException('EQUIPMENT_EQUIPMENT_NOT_FOUND');
    }
    return plainToInstance(EquipmentResponseDto, equipment, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    equipmentId: string,
    dto: UpdateEquipmentDto,
    updatedById?: string,
  ): Promise<EquipmentResponseDto> {
    const existing = await this.prisma.equipment.findUnique({
      where: { equipmentId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('EQUIPMENT_EQUIPMENT_NOT_FOUND');
    }

    if (dto.engineEnergy && !isEquipmentEngineEnergy(dto.engineEnergy)) {
      throw new BadRequestException('EQUIPMENT_EQUIPMENT_ENGINE_ENERGY_INVALID');
    }

    const newBrandName = await this.resolveBrandNameForUpdate(
      dto.brandId,
      dto.brandName,
      existing.brandId,
      existing.brandName,
    );
    const newCatalogName = await this.resolveCatalogNameForUpdate(
      dto.catalogId,
      dto.catalogName,
      existing.catalogId,
      existing.catalogName,
    );
    const newModel = dto.model ?? existing.model;

    // 复合唯一性重新校验（排除自身）
    if (newModel !== existing.model || newBrandName !== existing.brandName) {
      await this.assertCompositeUnique(newBrandName, newModel, equipmentId);
    }

    const {
      brandName: _ignoredBrandName,
      catalogName: _ignoredCatalogName,
      productionDateStart: rawStart,
      productionDateEnd: rawEnd,
      ...rest
    } = dto;

    const data: Prisma.EquipmentUncheckedUpdateInput = {
      ...rest,
      brandName: newBrandName,
      catalogName: newCatalogName,
      updatedById: updatedById ?? null,
    };
    if (rawStart !== undefined) {
      data.productionDateStart = rawStart ? new Date(rawStart) : null;
    }
    if (rawEnd !== undefined) {
      data.productionDateEnd = rawEnd ? new Date(rawEnd) : null;
    }

    try {
      const equipment = await this.prisma.equipment.update({
        where: { equipmentId },
        data,
      });
      return plainToInstance(EquipmentResponseDto, equipment, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(equipmentId: string): Promise<void> {
    const existing = await this.prisma.equipment.findUnique({
      where: { equipmentId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('EQUIPMENT_EQUIPMENT_NOT_FOUND');
    }
    await this.softDelete.softDelete(
      this.prisma.equipment,
      'equipmentId',
      equipmentId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.equipment.updateMany({
      where: { equipmentId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async attachFilters(
    equipmentId: string,
    filterIds: string[],
  ): Promise<{ added: number; skipped: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.equipmentFilter.findMany({
        where: { equipmentId, filterId: { in: filterIds } },
        select: { filterId: true },
      });
      const toAdd = filterIds.filter(
        (id) => !existing.some((e) => e.filterId === id),
      );
      if (toAdd.length > 0) {
        await tx.equipmentFilter.createMany({
          data: toAdd.map((filterId) => ({ equipmentId, filterId })),
          skipDuplicates: true,
        });
      }
      return { added: toAdd.length, skipped: existing.length };
    });
  }

  async detachFilter(equipmentId: string, filterId: string): Promise<void> {
    await this.prisma.equipmentFilter.deleteMany({
      where: { equipmentId, filterId },
    });
  }

  async listFilters(equipmentId: string): Promise<Filter[]> {
    const items = await this.prisma.equipmentFilter.findMany({
      where: { equipmentId },
      include: { filter: true },
    });
    return items
      .map((ef) => ef.filter)
      .filter((f): f is Filter => f !== null);
  }

  /**
   * create 场景品牌快照解析：提供 brandId 则读品牌名称；否则要求 brandName。
   */
  private async resolveBrandNameForCreate(
    brandId: string | undefined,
    brandName: string | undefined,
  ): Promise<string> {
    if (brandId) {
      const brand = await this.prisma.equipmentBrand.findUnique({
        where: { brandId },
      });
      if (!brand || brand.deletedAt) {
        throw new NotFoundException('EQUIPMENT_BRAND_NOT_FOUND');
      }
      return brand.name;
    }
    if (!brandName) {
      throw new BadRequestException('EQUIPMENT_BRAND_NAME_REQUIRED');
    }
    return brandName;
  }

  private async resolveCatalogNameForCreate(
    catalogId: string | undefined,
    catalogName: string | undefined,
  ): Promise<string> {
    if (catalogId) {
      const catalog = await this.prisma.equipmentCatalog.findUnique({
        where: { catalogId },
      });
      if (!catalog || catalog.deletedAt) {
        throw new NotFoundException('EQUIPMENT_CATALOG_NOT_FOUND');
      }
      return catalog.name;
    }
    if (!catalogName) {
      throw new BadRequestException('EQUIPMENT_CATALOG_NAME_REQUIRED');
    }
    return catalogName;
  }

  /**
   * update 场景品牌快照解析：brandId 变更则读新品牌名称；否则用 dto.brandName 或保持原值。
   */
  private async resolveBrandNameForUpdate(
    brandId: string | undefined,
    brandName: string | undefined,
    existingBrandId: string | null,
    existingBrandName: string,
  ): Promise<string> {
    if (brandId !== undefined && brandId !== existingBrandId) {
      if (brandId !== null) {
        const brand = await this.prisma.equipmentBrand.findUnique({
          where: { brandId },
        });
        if (!brand || brand.deletedAt) {
          throw new NotFoundException('EQUIPMENT_BRAND_NOT_FOUND');
        }
        return brand.name;
      }
      // 显式置空品牌：要求显式提供 brandName 快照
      if (!brandName) {
        throw new BadRequestException('EQUIPMENT_BRAND_NAME_REQUIRED');
      }
      return brandName;
    }
    if (brandName !== undefined) {
      return brandName;
    }
    return existingBrandName;
  }

  private async resolveCatalogNameForUpdate(
    catalogId: string | undefined,
    catalogName: string | undefined,
    existingCatalogId: string | null,
    existingCatalogName: string,
  ): Promise<string> {
    if (catalogId !== undefined && catalogId !== existingCatalogId) {
      if (catalogId !== null) {
        const catalog = await this.prisma.equipmentCatalog.findUnique({
          where: { catalogId },
        });
        if (!catalog || catalog.deletedAt) {
          throw new NotFoundException('EQUIPMENT_CATALOG_NOT_FOUND');
        }
        return catalog.name;
      }
      if (!catalogName) {
        throw new BadRequestException('EQUIPMENT_CATALOG_NAME_REQUIRED');
      }
      return catalogName;
    }
    if (catalogName !== undefined) {
      return catalogName;
    }
    return existingCatalogName;
  }

  /**
   * 复合唯一性校验（brandName + model）。create 不传 excludeEquipmentId；
   * update 传 excludeEquipmentId 排除自身。活跃冲突与软删除冲突分别抛出。
   */
  private async assertCompositeUnique(
    brandName: string,
    model: string,
    excludeEquipmentId?: string,
  ): Promise<void> {
    const baseWhere: Record<string, unknown> = { brandName, model };
    if (excludeEquipmentId) {
      baseWhere.NOT = { equipmentId: excludeEquipmentId };
    }

    const activeConflict = await this.prisma.equipment.findFirst({
      where: { ...baseWhere, deletedAt: null },
      select: { equipmentId: true },
    });
    if (activeConflict) {
      throw new ConflictException('EQUIPMENT_EQUIPMENT_DUPLICATED');
    }

    const softDeletedConflict = await this.prisma.equipment.findFirst({
      where: { ...baseWhere, deletedAt: { not: null } },
      select: { equipmentId: true },
    });
    if (softDeletedConflict) {
      throw new ConflictException('EQUIPMENT_EQUIPMENT_DUPLICATED_SOFT_DELETED');
    }
  }

  /**
   * P2002 兜底：复合唯一约束冲突统一使用 EQUIPMENT_EQUIPMENT 前缀。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      this.softDelete.handleUniqueError(error, EQUIPMENT_UNIQUE_PREFIX);
    }
    throw error;
  }
}
