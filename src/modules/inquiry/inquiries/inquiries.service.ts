import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { BaseService } from '@/shared/services/base.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { PaginationData } from '@/shared/interfaces/response.interface';
import { startOfDay, endOfDay } from '@/shared/utils/time.util';
import {
  INQUIRY_STATUS,
  isValidStatusTransition,
} from '@/shared/constants/inquiry.constant';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { UpdateInquiryStatusDto } from './dto/update-inquiry-status.dto';
import { QueryInquiryDto } from './dto/query-inquiry.dto';
import { InquiryResponseDto } from './dto/inquiry-response.dto';
// 类型仅在编译期引用（creates no runtime module edge），避免 b2c → inquiry → b2c 环
import type { CreateCustomerInquiryDto } from '@/modules/b2c/inquiries/dto/create-customer-inquiry.dto';
import type { CreateInquiryLineItemDto } from '@/modules/b2c/inquiries/dto/create-inquiry-line-item.dto';

@Injectable()
export class InquiriesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateInquiryDto,
    createdById?: string,
  ): Promise<InquiryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const prefix = `INQ${yyyy}${mm}-`;
      const { expiresAt, ...rest } = dto;

      for (let attempt = 0; attempt < 3; attempt++) {
        const last = await tx.inquiry.findFirst({
          where: { inquiryNo: { startsWith: prefix } },
          orderBy: { inquiryNo: 'desc' },
        });
        const next = (last ? parseInt(last.inquiryNo.slice(-4), 10) : 0) + 1;
        const candidate = `${prefix}${String(next).padStart(4, '0')}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`;
        try {
          const inquiry = await tx.inquiry.create({
            data: {
              ...rest,
              inquiryNo: candidate,
              status: INQUIRY_STATUS.DRAFT,
              createdById: createdById ?? null,
              ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
            },
          });
          return plainToInstance(InquiryResponseDto, inquiry, {
            excludeExtraneousValues: true,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            attempt < 2
          ) {
            continue;
          }
          throw error;
        }
      }
      throw new InternalServerErrorException('INQUIRY_NO_GENERATION_FAILED');
    });
  }

  /**
   * B2C 客户自助创建询价单（所有权下沉到接口）。
   *
   * `customerId` 为首参（来自 `@CurrentCustomer()`），忽略任何 DTO 中的
   * customer 身份字段（DTO 本就不含）；`createdById = null`（B2C 无后台操作员）；
   * 主体 + 明细行在**同一事务**内原子创建（一笔询价是原子业务单元，拆两次调用
   * 会留下孤儿询价）。客户名/邮箱/电话快照自 Customer 记录填充，明细行
   * productName/model/typeName 自 Filter 快照填充；`shippingAddressId` 校验属于
   * 当前客户。
   */
  async createForCustomer(
    customerId: string,
    dto: CreateCustomerInquiryDto,
    lines: CreateInquiryLineItemDto[],
  ): Promise<InquiryResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
    });
    if (!customer || customer.deletedAt) {
      throw new NotFoundException('CUSTOMER_NOT_FOUND');
    }

    // shippingAddressId 归属校验：仅当前客户本人地址可用
    if (dto.shippingAddressId) {
      const address = await this.prisma.customerAddress.findUnique({
        where: { addressId: dto.shippingAddressId },
      });
      if (!address || address.deletedAt || address.customerId !== customerId) {
        throw new BadRequestException('INVALID_SHIPPING_ADDRESS');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const prefix = `INQ${yyyy}${mm}-`;

      for (let attempt = 0; attempt < 3; attempt++) {
        const last = await tx.inquiry.findFirst({
          where: { inquiryNo: { startsWith: prefix } },
          orderBy: { inquiryNo: 'desc' },
        });
        const next = (last ? parseInt(last.inquiryNo.slice(-4), 10) : 0) + 1;
        const candidate = `${prefix}${String(next).padStart(4, '0')}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`;
        try {
          const inquiry = await tx.inquiry.create({
            data: {
              title: dto.title,
              description: dto.description ?? null,
              inquiryNo: candidate,
              status: INQUIRY_STATUS.DRAFT,
              customerId,
              createdById: null,
              customerName: customer.nickName ?? null,
              customerEmail: customer.email ?? null,
              customerPhone: customer.phoneNumber ?? null,
              shippingAddressId: dto.shippingAddressId ?? null,
            },
          });

          for (const line of lines) {
            let productName: string;
            let model: string | undefined;
            let typeName: string | undefined;

            if (line.filterId) {
              const filter = await tx.filter.findUnique({
                where: { filterId: line.filterId },
              });
              if (!filter || filter.deletedAt) {
                throw new NotFoundException('EQUIPMENT_FILTER_NOT_FOUND');
              }
              productName = filter.model;
              model = filter.model;
              typeName = filter.typeName;
            } else if (line.productName) {
              productName = line.productName;
            } else {
              throw new BadRequestException('INQUIRY_LINE_PRODUCT_NAME_REQUIRED');
            }

            await tx.inquiryLine.create({
              data: {
                inquiryId: inquiry.inquiryId,
                filterId: line.filterId ?? null,
                productName,
                model: model ?? null,
                typeName: typeName ?? null,
                quantity: line.quantity ?? 1,
                remarks: line.remarks ?? null,
                sortOrder: line.sortOrder ?? 0,
                createdById: null,
              },
            });
          }

          return plainToInstance(InquiryResponseDto, inquiry, {
            excludeExtraneousValues: true,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            attempt < 2
          ) {
            continue;
          }
          throw error;
        }
      }
      throw new InternalServerErrorException('INQUIRY_NO_GENERATION_FAILED');
    });
  }

  /**
   * 客户查询本人询价单列表（`createdAt` 降序分页，仅当前客户）。
   */
  async findMyInquiries(
    customerId: string,
    query: QueryInquiryDto,
  ): Promise<PaginationData<InquiryResponseDto>> {
    const where: Record<string, unknown> = { deletedAt: null, customerId };
    const result = await this.paginateWithSort(
      this.prisma.inquiry,
      query,
      where,
      undefined,
      'createdAt',
    );
    return {
      ...result,
      items: plainToInstance(InquiryResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * 客户查询本人询价单详情（含明细行与报价字段）。他人询价单返回 404，
   * 不泄露任何询价信息。
   */
  async findOneForCustomer(
    customerId: string,
    inquiryId: string,
  ): Promise<InquiryResponseDto> {
    const inquiry = await this.prisma.inquiry.findFirst({
      where: { inquiryId, customerId },
      include: { inquiryLines: true },
    });
    if (!inquiry || inquiry.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    return plainToInstance(InquiryResponseDto, inquiry, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(
    query: QueryInquiryDto,
  ): Promise<PaginationData<InquiryResponseDto>> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { inquiryNo: { contains: query.keyword, mode: 'insensitive' } },
        { customerName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.createdById) {
      where.createdById = query.createdById;
    }
    if (query.createdAtStart || query.createdAtEnd) {
      const tzSuffix = this.configService.get<string>('app.tzSuffix', '+08:00');
      const o: { gte?: Date; lte?: Date } = {};
      if (query.createdAtStart) {
        o.gte = startOfDay(query.createdAtStart, tzSuffix);
      }
      if (query.createdAtEnd) {
        o.lte = endOfDay(query.createdAtEnd, tzSuffix);
      }
      where.createdAt = o;
    }

    const result = await this.paginateWithSort(
      this.prisma.inquiry,
      query,
      where,
      undefined,
      'createdAt',
    );
    return {
      ...result,
      items: plainToInstance(InquiryResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(inquiryId: string): Promise<InquiryResponseDto> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
      include: { inquiryLines: true },
    });
    if (!inquiry || inquiry.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    return plainToInstance(InquiryResponseDto, inquiry, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    inquiryId: string,
    dto: UpdateInquiryDto,
    updatedById?: string,
  ): Promise<InquiryResponseDto> {
    const existing = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }

    const { expiresAt, ...rest } = dto;
    const inquiry = await this.prisma.inquiry.update({
      where: { inquiryId },
      data: {
        ...rest,
        updatedById: updatedById ?? null,
        ...(expiresAt !== undefined
          ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
          : {}),
      },
    });
    return plainToInstance(InquiryResponseDto, inquiry, {
      excludeExtraneousValues: true,
    });
  }

  async updateStatus(
    inquiryId: string,
    newStatus: string,
    dto?: UpdateInquiryStatusDto,
    updatedById?: string,
  ): Promise<InquiryResponseDto> {
    const existing = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    if (!isValidStatusTransition(existing.status, newStatus)) {
      throw new ConflictException('INQUIRY_INVALID_STATUS_TRANSITION');
    }

    const now = new Date();
    const inquiry = await this.prisma.inquiry.update({
      where: { inquiryId },
      data: {
        status: newStatus,
        updatedById: updatedById ?? null,
        ...(newStatus === INQUIRY_STATUS.SUBMITTED ? { submittedAt: now } : {}),
        ...(newStatus === INQUIRY_STATUS.QUOTED
          ? {
              quotedAt: now,
              ...(dto?.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
            }
          : {}),
      },
    });
    return plainToInstance(InquiryResponseDto, inquiry, {
      excludeExtraneousValues: true,
    });
  }

  async remove(inquiryId: string): Promise<void> {
    const existing = await this.prisma.inquiry.findUnique({
      where: { inquiryId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('INQUIRY_NOT_FOUND');
    }
    await this.softDelete.softDelete(
      this.prisma.inquiry,
      'inquiryId',
      inquiryId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.inquiry.updateMany({
      where: { inquiryId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
