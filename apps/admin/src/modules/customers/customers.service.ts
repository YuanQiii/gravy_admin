import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, SoftDeleteService, PaginationData } from '@gvray/core';




import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';

/**
 * 客户唯一字段 → P2002 兜底错误码前缀映射。
 * 注意 phoneNumber 对应前缀 CUSTOMER_PHONE（spec 约定）。
 */
const CUSTOMER_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  username: 'CUSTOMER_USERNAME',
  email: 'CUSTOMER_EMAIL',
  phoneNumber: 'CUSTOMER_PHONE',
  openid: 'CUSTOMER_OPENID',
  unionid: 'CUSTOMER_UNIONID',
};

@Injectable()
export class CustomersService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    await this.softDelete.assertUniqueActive(
      this.prisma.customer,
      'username',
      dto.username,
      { errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.username },
    );
    if (dto.email) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'email',
        dto.email,
        { errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.email },
      );
    }
    if (dto.phoneNumber) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'phoneNumber',
        dto.phoneNumber,
        { errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.phoneNumber },
      );
    }
    if (dto.openid) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'openid',
        dto.openid,
        { errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.openid },
      );
    }
    if (dto.unionid) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'unionid',
        dto.unionid,
        { errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.unionid },
      );
    }

    // 密码哈希后存储（spec：明文不落库），与项目惯例（bcrypt, cost=10）一致
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    try {
      const customer = await this.prisma.customer.create({
        data: { ...dto, password: hashedPassword },
      });
      return plainToInstance(CustomerResponseDto, customer, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryCustomerDto,
  ): Promise<PaginationData<CustomerResponseDto>> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword, mode: 'insensitive' } },
        { nickName: { contains: query.keyword, mode: 'insensitive' } },
        { email: { contains: query.keyword, mode: 'insensitive' } },
        { phoneNumber: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }

    const result = await this.paginateWithSort(
      this.prisma.customer,
      query,
      where,
      undefined,
    );
    return {
      ...result,
      items: plainToInstance(CustomerResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(customerId: string): Promise<CustomerResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
    });
    if (!customer || customer.deletedAt) {
      throw new NotFoundException('客户不存在');
    }
    return plainToInstance(CustomerResponseDto, customer, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    const existing = await this.prisma.customer.findUnique({
      where: { customerId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('客户不存在');
    }

    if (dto.username && dto.username !== existing.username) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'username',
        dto.username,
        {
          errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.username,
          excludeIdField: 'customerId',
          excludeIdValue: customerId,
        },
      );
    }
    if (dto.email && dto.email !== existing.email) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'email',
        dto.email,
        {
          errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.email,
          excludeIdField: 'customerId',
          excludeIdValue: customerId,
        },
      );
    }
    if (dto.phoneNumber && dto.phoneNumber !== existing.phoneNumber) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'phoneNumber',
        dto.phoneNumber,
        {
          errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.phoneNumber,
          excludeIdField: 'customerId',
          excludeIdValue: customerId,
        },
      );
    }
    if (dto.openid && dto.openid !== existing.openid) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'openid',
        dto.openid,
        {
          errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.openid,
          excludeIdField: 'customerId',
          excludeIdValue: customerId,
        },
      );
    }
    if (dto.unionid && dto.unionid !== existing.unionid) {
      await this.softDelete.assertUniqueActive(
        this.prisma.customer,
        'unionid',
        dto.unionid,
        {
          errorPrefix: CUSTOMER_UNIQUE_PREFIX_BY_FIELD.unionid,
          excludeIdField: 'customerId',
          excludeIdValue: customerId,
        },
      );
    }

    try {
      const customer = await this.prisma.customer.update({
        where: { customerId },
        data: { ...dto },
      });
      return plainToInstance(CustomerResponseDto, customer, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(customerId: string): Promise<void> {
    const existing = await this.prisma.customer.findUnique({
      where: { customerId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('客户不存在');
    }
    await this.softDelete.softDelete(
      this.prisma.customer,
      'customerId',
      customerId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.customer.updateMany({
      where: { customerId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * P2002 兜底：按 error.meta.target 选对应字段前缀；无法识别时退回 USERNAME。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      const field = target.find((t) => CUSTOMER_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? CUSTOMER_UNIQUE_PREFIX_BY_FIELD[field]
        : CUSTOMER_UNIQUE_PREFIX_BY_FIELD.username;
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
