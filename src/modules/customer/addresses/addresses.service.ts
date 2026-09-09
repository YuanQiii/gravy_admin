import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { PrismaService, BaseService, PaginationData } from '@gvray/core';



import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { QueryAddressDto } from './dto/query-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';

@Injectable()
export class AddressesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
  ) {
    super(prisma, configService);
  }

  async create(dto: CreateAddressDto): Promise<AddressResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId: dto.customerId },
    });
    if (!customer || customer.deletedAt) {
      throw new NotFoundException('CUSTOMER_NOT_FOUND');
    }

    if (dto.isDefault === true) {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.customerAddress.updateMany({
          where: { customerId: dto.customerId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.customerAddress.create({ data: { ...dto } });
      });
      return plainToInstance(AddressResponseDto, created, {
        excludeExtraneousValues: true,
      });
    }

    const created = await this.prisma.customerAddress.create({
      data: { ...dto },
    });
    return plainToInstance(AddressResponseDto, created, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(
    query: QueryAddressDto,
  ): Promise<PaginationData<AddressResponseDto>> {
    const where = this.buildWhere({
      equals: {
        customerId: query.customerId,
        receiver: query.receiver,
        phone: query.phone,
      },
    });
    where.deletedAt = null;

    const result = await this.paginateWithSort(
      this.prisma.customerAddress,
      query,
      where,
      undefined,
      'createdAt',
    );
    return {
      ...result,
      items: plainToInstance(AddressResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  async findOne(addressId: string): Promise<AddressResponseDto> {
    const address = await this.prisma.customerAddress.findUnique({
      where: { addressId },
    });
    if (!address || address.deletedAt) {
      throw new NotFoundException('地址不存在');
    }
    return plainToInstance(AddressResponseDto, address, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    const existing = await this.prisma.customerAddress.findUnique({
      where: { addressId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('地址不存在');
    }

    if (dto.isDefault === true) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.customerAddress.updateMany({
          where: { customerId: existing.customerId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.customerAddress.update({
          where: { addressId },
          data: { ...dto },
        });
      });
      return plainToInstance(AddressResponseDto, updated, {
        excludeExtraneousValues: true,
      });
    }

    const updated = await this.prisma.customerAddress.update({
      where: { addressId },
      data: { ...dto },
    });
    return plainToInstance(AddressResponseDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  async setDefault(addressId: string): Promise<void> {
    const existing = await this.prisma.customerAddress.findUnique({
      where: { addressId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('地址不存在');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({
        where: { customerId: existing.customerId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.customerAddress.update({
        where: { addressId },
        data: { isDefault: true },
      });
    });
  }

  /**
   * 删除地址（spec scenario：硬删）。
   * CustomerAddress 表保留 deletedAt 字段供未来扩展，但当前 remove 按 spec 执行硬删。
   */
  async remove(addressId: string): Promise<void> {
    const existing = await this.prisma.customerAddress.findUnique({
      where: { addressId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('地址不存在');
    }
    await this.prisma.customerAddress.delete({ where: { addressId } });
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.customerAddress.deleteMany({
      where: { addressId: { in: ids }, deletedAt: null },
    });
  }
}
