import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { SoftDeleteService } from '@/shared/services/soft-delete.service';
import { InquiriesService } from './inquiries.service';

// 最小可用的 Prisma 代理：仅 mock 本次涉及的方法
function makePrisma() {
  const txStore: any = {};
  return {
    $transaction: (fn: (tx: any) => Promise<unknown>) =>
      fn({
        inquiry: {
          findFirst: jest.fn(async () => null),
          create: jest.fn((data: any) =>
            Promise.resolve({
              inquiryId: 'inq-001',
              inquiryNo: data.data.inquiryNo,
              customerId: data.data.customerId,
              status: data.data.status,
            }),
          ),
        },
        inquiryLine: {
          create: jest.fn(() => Promise.resolve({ inquiryLineId: 'line-001' })),
        },
        filter: {
          findUnique: jest.fn(async () => ({
            filterId: 'flt-001',
            model: '320D',
            typeName: 'Hydraulic',
            deletedAt: null,
          })),
        },
        $executeRaw: () => Promise.resolve(),
      }),
    customer: {
      findUnique: jest.fn(),
    },
    customerAddress: {
      findUnique: jest.fn(),
    },
    inquiry: {
      findFirst: jest.fn(),
    },
    inquiryLine: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('InquiriesService.createForCustomer', () => {
  const baseDto: any = {
    title: '采购 320D 液压滤清器',
    lines: [{ filterId: 'flt-001', quantity: 2 }],
  };

  function buildService(prisma: any) {
    const service = new InquiriesService(
      prisma,
      {} as ConfigService,
      {} as SoftDeleteService,
    );
    // 注入 base.service 依赖
    (service as any).prisma = prisma;
    return service;
  }

  it('客户不存在抛 404（身份必须落在已存在客户上）', async () => {
    const prisma = makePrisma();
    (prisma as any).customer.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);
    await expect(
      service.createForCustomer('cust-A', baseDto, baseDto.lines),
    ).rejects.toThrow(NotFoundException);
  });

  it('他人 shippingAddressId 归属校验失败抛 400，不创建询价', async () => {
    const prisma = makePrisma();
    (prisma as any).customer.findUnique.mockResolvedValue({
      customerId: 'cust-A',
      nickName: 'Alice',
      deletedAt: null,
    });
    (prisma as any).customerAddress.findUnique.mockResolvedValue({
      addressId: 'addr-other',
      customerId: 'cust-B', // 他人
      deletedAt: null,
    });
    const service = buildService(prisma);
    await expect(
      service.createForCustomer('cust-A', { ...baseDto, shippingAddressId: 'addr-other' }, baseDto.lines),
    ).rejects.toThrow(BadRequestException);
  });

  it('本人 shippingAddressId 通过归属校验，事务内创建询价主体+明细行', async () => {
    const prisma = makePrisma();
    (prisma as any).customer.findUnique.mockResolvedValue({
      customerId: 'cust-A',
      nickName: 'Alice',
      email: 'alice@example.com',
      phoneNumber: '13800000000',
      deletedAt: null,
    });
    (prisma as any).customerAddress.findUnique.mockResolvedValue({
      addressId: 'addr-own',
      customerId: 'cust-A',
      deletedAt: null,
    });

    const txCreate = jest.fn();
    // 覆盖 makePrisma 的 $transaction 内 inquiry.create with spy wrapper
    const service = buildService(prisma);
    // 重建 $transaction 以捕获 create 调用
    (service as any).prisma.$transaction = (fn: any) =>
      fn({
        inquiry: {
          findFirst: jest.fn(async () => null),
          create: txCreate.mockResolvedValue({
            inquiryId: 'inq-001',
            inquiryNo: 'INQ202609-0001',
            customerId: 'cust-A',
            status: 'draft',
          }),
        },
        inquiryLine: {
          create: jest.fn(() => Promise.resolve({ inquiryLineId: 'line-001' })),
        },
        filter: {
          findUnique: jest.fn(async () => ({
            filterId: 'flt-001',
            model: '320D',
            typeName: 'Hydraulic',
            deletedAt: null,
          })),
        },
        $executeRaw: () => Promise.resolve(),
      });

    const result = await service.createForCustomer(
      'cust-A',
      { ...baseDto, shippingAddressId: 'addr-own' },
      baseDto.lines,
    );

    expect(result.inquiryNo).toBe('INQ202609-0001');
    expect(result.status).toBe('draft');
    // 主体创建时 customerId 必须是首参（非客户端指定），createdById 为空
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'cust-A',
          createdById: null,
          customerName: 'Alice',
        }),
      }),
    );
  });

  it('findOneForCustomer 请求他人询价返回 404', async () => {
    const prisma = makePrisma();
    (prisma as any).inquiry.findFirst.mockResolvedValue(null);
    const service = buildService(prisma);
    await expect(
      service.findOneForCustomer('cust-A', 'inq-other'),
    ).rejects.toThrow(NotFoundException);
  });
});