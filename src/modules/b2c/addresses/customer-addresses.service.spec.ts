import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@gvray/core';

import { CustomerAddressesService } from './customer-addresses.service';

function makePrisma() {
  const tx = {
    customerAddress: {
      updateMany: jest.fn(() => Promise.resolve()),
      update: jest.fn((args: any) =>
        Promise.resolve({
          addressId: args.where.addressId,
          customerId: 'cust-A',
          receiver: '张三',
          isDefault: true,
        }),
      ),
      delete: jest.fn(() => Promise.resolve()),
    },
  };
  return {
    $transaction: jest.fn((fn: any) => fn(tx)),
    customerAddress: {
      findUnique: jest.fn(),
      create: jest.fn((args: any) =>
        Promise.resolve({ ...args.data, addressId: 'addr-new' }),
      ),
      updateMany: jest.fn(() => Promise.resolve()),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;
}

function buildService(prisma: any) {
  return new CustomerAddressesService(
    prisma,
    {} as ConfigService,
  );
}

describe('CustomerAddressesService (B2C self 域)', () => {
  it('updateForCustomer 操作他人地址返回 404（归属过滤下沉接口）', async () => {
    const prisma = makePrisma();
    // findUnique 返回他人地址（customerId != 首参）
    (prisma as any).customerAddress.findUnique.mockResolvedValue({
      addressId: 'addr-other',
      customerId: 'cust-B',
      deletedAt: null,
    });
    const service = buildService(prisma);
    await expect(
      service.updateForCustomer('cust-A', 'addr-other', { receiver: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createForCustomer 强制 customerId 取首参（存活 DTO 无此字段）', async () => {
    const prisma = makePrisma();
    (prisma as any).customerAddress.findUnique.mockResolvedValue({
      addressId: 'addr-x',
      customerId: 'cust-A',
      deletedAt: null,
    });
    const service = buildService(prisma);
    const created = await service.createForCustomer('cust-A', {
      receiver: '张三',
      phone: '138',
      province: '广东',
      city: '深圳',
      detailAddress: 'xxx',
    });
    expect(created.addressId).toBe('addr-new');
    expect((prisma as any).customerAddress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: 'cust-A' }),
    });
  });

  it('setDefaultForCustomer 走 $transaction 内清空同客户旧默认并置新默认', async () => {
    const prisma = makePrisma();
    (prisma as any).customerAddress.findUnique.mockResolvedValue({
      addressId: 'addr-own',
      customerId: 'cust-A',
      deletedAt: null,
    });
    const service = buildService(prisma);
    await service.setDefaultForCustomer('cust-A', 'addr-own');
    // $transaction 已调用
    expect((prisma as any).$transaction).toHaveBeenCalled();
    expect(prisma.customerAddress.findUnique).toHaveBeenCalledWith({
      where: { addressId: 'addr-own' },
    });
  });
});