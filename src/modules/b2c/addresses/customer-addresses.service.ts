import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { PrismaService, BaseService } from '@gvray/core';


import { AddressResponseDto } from '@/modules/customer/addresses/dto/address-response.dto';
import { QueryAddressDto } from '@/modules/customer/addresses/dto/query-address.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';

/**
 * B2C 客户自助收货地址 self 域深模块。
 *
 * **不**在后台 `AddressesService` 平铺 `*ForCustomer`：admin 代管（customerId 在
 * DTO）与 B2C self（customerId 首参）是**两个信任维度**。本 Service 归属过滤
 * 下沉到 `findUnique({ addressId, customerId })`——他人 addressId 视为"不可见"
 * 返回 404，接口直接表达"只能操作名下地址"。
 */
type TxLike = Prisma.TransactionClient;

@Injectable()
export class CustomerAddressesService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
  ) {
    super(prisma, configService);
  }

  /**
   * 同一事务内把某地址设为默认：先清同客户其他默认，再置本地址为默认。
   * isDefault 的"同客户唯一"不变量单点实现（bug 单点修）。
   */
  private async setAsDefaultInTx(
    tx: TxLike,
    customerId: string,
    addressId: string,
  ): Promise<void> {
    await tx.customerAddress.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.customerAddress.update({
      where: { addressId },
      data: { isDefault: true },
    });
  }

  async createForCustomer(
    customerId: string,
    dto: CreateCustomerAddressDto,
  ): Promise<AddressResponseDto> {
    if (dto.isDefault === true) {
      // 新地址 id 未知，仅清空同客户其他默认（新地址自带 isDefault=true）
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.customerAddress.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.customerAddress.create({ data: { ...dto, customerId } });
      });
      return this.toDto(created);
    }
    const created = await this.prisma.customerAddress.create({
      data: { ...dto, customerId },
    });
    return this.toDto(created);
  }

  async findMyAddresses(customerId: string, query: QueryAddressDto) {
    const where = { deletedAt: null, customerId } as Record<string, unknown>;
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

  async updateForCustomer(
    customerId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ): Promise<AddressResponseDto> {
    await this.assertOwned(customerId, addressId);
    if (dto.isDefault === true) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.setAsDefaultInTx(tx, customerId, addressId);
        return tx.customerAddress.update({
          where: { addressId },
          data: { ...dto },
        });
      });
      return this.toDto(updated);
    }
    const updated = await this.prisma.customerAddress.update({
      where: { addressId },
      data: { ...dto },
    });
    return this.toDto(updated);
  }

  async setDefaultForCustomer(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    await this.assertOwned(customerId, addressId);
    await this.prisma.$transaction((tx) =>
      this.setAsDefaultInTx(tx, customerId, addressId),
    );
  }

  async removeForCustomer(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    await this.assertOwned(customerId, addressId);
    await this.prisma.customerAddress.delete({ where: { addressId } });
  }

  /** 归属校验：他人 addressId 视为不可见 → 404。 */
  private async assertOwned(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    const address = await this.prisma.customerAddress.findUnique({
      where: { addressId },
    });
    if (!address || address.deletedAt || address.customerId !== customerId) {
      throw new NotFoundException('地址不存在');
    }
  }

  private toDto(row: any): AddressResponseDto {
    return plainToInstance(AddressResponseDto, row, {
      excludeExtraneousValues: true,
    });
  }
}