import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, SoftDeleteService, PaginationData } from '@gvray/core';
import { InquiryPricingService } from '../pricing/inquiry-pricing.service';
import { toMoney } from '../pricing/money';

import { CreateInquiryLineDto } from './dto/create-inquiry-line.dto';
import { UpdateInquiryLineDto } from './dto/update-inquiry-line.dto';
import { QueryInquiryLineDto } from './dto/query-inquiry-line.dto';
import { InquiryLineResponseDto } from './dto/inquiry-line-response.dto';

type LineTx = Prisma.TransactionClient;

/**
 * 明细行写路径的**统一出口**（design 决策 8）：任何明细变更都经它执行，
 * 并在**同一事务内**无条件重算整单合计。
 *
 * 为什么无条件：把"要不要重算"留给调用方，就是把 P3-6 要消灭的缺陷
 * （合计与明细不一致）换一个位置再犯一次。四个公开出口因此不再各自
 * 记得调用重算 —— 漏算在结构上不可能。
 */
@Injectable()
export class InquiryLinesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
    private readonly pricing: InquiryPricingService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateInquiryLineDto,
    createdById?: string,
  ): Promise<InquiryLineResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const inquiry = await tx.inquiry.findUnique({
        where: { inquiryId: dto.inquiryId },
      });
      if (!inquiry || inquiry.deletedAt) {
        throw new NotFoundException('INQUIRY_NOT_FOUND');
      }

      const snapshot = await this.resolveLineSnapshot(tx, dto);
      const quantity = dto.quantity ?? 1;
      const unitPrice = toMoney(dto.unitPrice ?? null);

      const line = await this.writeLine(tx, dto.inquiryId, () =>
        tx.inquiryLine.create({
          data: {
            inquiryId: dto.inquiryId,
            filterId: dto.filterId ?? null,
            productName: snapshot.productName,
            model: snapshot.model,
            typeName: snapshot.typeName,
            quantity,
            unitPrice: dto.unitPrice ?? null,
            subtotal: this.pricing.deriveLineSubtotal(quantity, unitPrice),
            remarks: dto.remarks ?? null,
            sortOrder: dto.sortOrder ?? 0,
            createdById: createdById ?? null,
          },
        }),
      );
      return plainToInstance(InquiryLineResponseDto, line, {
        excludeExtraneousValues: true,
      });
    });
  }

  async findAll(
    query: QueryInquiryLineDto,
  ): Promise<PaginationData<InquiryLineResponseDto>> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.inquiryId) {
      where.inquiryId = query.inquiryId;
    }
    if (query.filterId) {
      where.filterId = query.filterId;
    }
    if (query.keyword) {
      where.productName = { contains: query.keyword, mode: 'insensitive' };
    }

    const result = await this.paginateWithSort(
      this.prisma.inquiryLine,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(InquiryLineResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(inquiryLineId: string): Promise<InquiryLineResponseDto> {
    const line = await this.prisma.inquiryLine.findUnique({
      where: { inquiryLineId },
    });
    if (!line || line.deletedAt) {
      throw new NotFoundException('INQUIRY_LINE_NOT_FOUND');
    }
    return plainToInstance(InquiryLineResponseDto, line, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    inquiryLineId: string,
    dto: UpdateInquiryLineDto,
    updatedById?: string,
  ): Promise<InquiryLineResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inquiryLine.findUnique({
        where: { inquiryLineId },
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('INQUIRY_LINE_NOT_FOUND');
      }

      const { filterId, quantity, unitPrice, ...rest } = dto;

      const snapshot: {
        productName?: string;
        model?: string;
        typeName?: string;
      } = {};
      if (filterId && filterId !== existing.filterId) {
        const filter = await tx.filter.findUnique({
          where: { filterId },
        });
        if (!filter || filter.deletedAt) {
          throw new NotFoundException('EQUIPMENT_FILTER_NOT_FOUND');
        }
        snapshot.productName = filter.model;
        snapshot.model = filter.model;
        snapshot.typeName = filter.typeName;
      }

      // 小计重算规则（design 决策 8 的 2.2）：quantity / unitPrice 任一出现在
      // patch 中即重算；两者都不出现则保持原值（"只改 remarks"不得抹掉价格）。
      const priceChanged =
        quantity !== undefined || unitPrice !== undefined;
      const subtotal = priceChanged
        ? this.pricing.deriveLineSubtotal(
            quantity ?? existing.quantity,
            toMoney(unitPrice ?? existing.unitPrice),
          )
        : undefined;

      const line = await this.writeLine(tx, existing.inquiryId, () =>
        tx.inquiryLine.update({
          where: { inquiryLineId },
          data: {
            ...rest,
            ...(quantity !== undefined ? { quantity } : {}),
            ...(unitPrice !== undefined ? { unitPrice } : {}),
            ...(subtotal !== undefined ? { subtotal } : {}),
            ...(filterId !== undefined ? { filterId: filterId || null } : {}),
            ...snapshot,
            updatedById: updatedById ?? null,
          },
        }),
      );
      return plainToInstance(InquiryLineResponseDto, line, {
        excludeExtraneousValues: true,
      });
    });
  }

  async remove(inquiryLineId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inquiryLine.findUnique({
        where: { inquiryLineId },
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('INQUIRY_LINE_NOT_FOUND');
      }
      await this.writeLine(tx, existing.inquiryId, () =>
        this.softDelete.softDelete(
          tx.inquiryLine,
          'inquiryLineId',
          inquiryLineId,
        ),
      );
    });
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const lines = await tx.inquiryLine.findMany({
        where: { inquiryLineId: { in: ids }, deletedAt: null },
        select: { inquiryLineId: true, inquiryId: true },
      });
      if (!lines.length) {
        return;
      }
      // 逐行走接缝：同一询价单的多行会触发多次重算（幂等、代价可控），
      // 换来的是"重算只发生在 writeLine 内"这一条不变量不被批处理打破。
      const now = new Date();
      for (const line of lines) {
        await this.writeLine(tx, line.inquiryId, () =>
          tx.inquiryLine.updateMany({
            where: { inquiryLineId: line.inquiryLineId },
            data: { deletedAt: now },
          }),
        );
      }
    });
  }

  /**
   * 快照解析：`filterId` 优先（须为可用滤清器，快照 model/typeName），
   * 否则必须显式提供 `productName`。
   */
  private async resolveLineSnapshot(
    tx: LineTx,
    dto: { filterId?: string | null; productName?: string | null },
  ): Promise<{ productName: string; model: string | null; typeName: string | null }> {
    if (dto.filterId) {
      const filter = await tx.filter.findUnique({
        where: { filterId: dto.filterId },
      });
      if (!filter || filter.deletedAt) {
        throw new NotFoundException('EQUIPMENT_FILTER_NOT_FOUND');
      }
      return {
        productName: filter.model,
        model: filter.model,
        typeName: filter.typeName,
      };
    }
    if (dto.productName) {
      return { productName: dto.productName, model: null, typeName: null };
    }
    throw new BadRequestException('INQUIRY_LINE_PRODUCT_NAME_REQUIRED');
  }

  /**
   * **明细行写路径的唯一出口**：执行写 → 同事务内无条件重算整单合计。
   *
   * `run` 是实际的写操作（create / update / softDelete），`inquiryId` 是该行
   * 所属询价单 —— 重算需要的上下文只有这两样。
   */
  private async writeLine<T>(
    tx: LineTx,
    inquiryId: string,
    run: (tx: LineTx) => Promise<T>,
  ): Promise<T> {
    const result = await run(tx);
    await this.pricing.recomputeForInquiry(tx, inquiryId);
    return result;
  }
}
