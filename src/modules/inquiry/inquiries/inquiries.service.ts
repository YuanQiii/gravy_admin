import {
  Injectable,
  NotFoundException,
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
