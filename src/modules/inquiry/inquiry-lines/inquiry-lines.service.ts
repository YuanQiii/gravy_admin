import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { PrismaService, BaseService, SoftDeleteService, PaginationData } from '@gvray/core';




import { CreateInquiryLineDto } from './dto/create-inquiry-line.dto';
import { UpdateInquiryLineDto } from './dto/update-inquiry-line.dto';
import { QueryInquiryLineDto } from './dto/query-inquiry-line.dto';
import { InquiryLineResponseDto } from './dto/inquiry-line-response.dto';

@Injectable()
export class InquiryLinesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateInquiryLineDto,
    createdById?: string,
  ): Promise<InquiryLineResponseDto> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { inquiryId: dto.inquiryId },
    });
    if (!inquiry || inquiry.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }

    let productName: string;
    let model: string | undefined;
    let typeName: string | undefined;

    if (dto.filterId) {
      const filter = await this.prisma.filter.findUnique({
        where: { filterId: dto.filterId },
      });
      if (!filter || filter.deletedAt) {
        throw new NotFoundException('EQUIPMENT_FILTER_NOT_FOUND');
      }
      productName = filter.model;
      model = filter.model;
      typeName = filter.typeName;
    } else if (dto.productName) {
      productName = dto.productName;
    } else {
      throw new BadRequestException('INQUIRY_LINE_PRODUCT_NAME_REQUIRED');
    }

    const line = await this.prisma.inquiryLine.create({
      data: {
        inquiryId: dto.inquiryId,
        filterId: dto.filterId ?? null,
        productName,
        model: model ?? null,
        typeName: typeName ?? null,
        quantity: dto.quantity ?? 1,
        unitPrice: dto.unitPrice ?? null,
        subtotal: dto.subtotal ?? null,
        remarks: dto.remarks ?? null,
        sortOrder: dto.sortOrder ?? 0,
        createdById: createdById ?? null,
      },
    });
    return plainToInstance(InquiryLineResponseDto, line, {
      excludeExtraneousValues: true,
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
    const existing = await this.prisma.inquiryLine.findUnique({
      where: { inquiryLineId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_LINE_NOT_FOUND');
    }

    const { filterId, ...rest } = dto;

    const snapshot: {
      productName?: string;
      model?: string;
      typeName?: string;
    } = {};
    if (filterId && filterId !== existing.filterId) {
      const filter = await this.prisma.filter.findUnique({
        where: { filterId },
      });
      if (!filter || filter.deletedAt) {
        throw new NotFoundException('EQUIPMENT_FILTER_NOT_FOUND');
      }
      snapshot.productName = filter.model;
      snapshot.model = filter.model;
      snapshot.typeName = filter.typeName;
    }

    const line = await this.prisma.inquiryLine.update({
      where: { inquiryLineId },
      data: {
        ...rest,
        ...(filterId !== undefined ? { filterId: filterId || null } : {}),
        ...snapshot,
        updatedById: updatedById ?? null,
      },
    });
    return plainToInstance(InquiryLineResponseDto, line, {
      excludeExtraneousValues: true,
    });
  }

  async remove(inquiryLineId: string): Promise<void> {
    const existing = await this.prisma.inquiryLine.findUnique({
      where: { inquiryLineId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_LINE_NOT_FOUND');
    }
    await this.softDelete.softDelete(
      this.prisma.inquiryLine,
      'inquiryLineId',
      inquiryLineId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.inquiryLine.updateMany({
      where: { inquiryLineId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
