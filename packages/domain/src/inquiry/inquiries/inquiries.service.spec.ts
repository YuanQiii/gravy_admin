import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, SoftDeleteService } from '@gvray/core';


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
          findMany: jest.fn(async () => [
            {
              filterId: 'flt-001',
              model: '320D',
              typeName: 'Hydraulic',
              deletedAt: null,
            },
          ]),
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
      updateMany: jest.fn(async () => ({ count: 0 })),
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
          findMany: jest.fn(async () => [
            {
              filterId: 'flt-001',
              model: '320D',
              typeName: 'Hydraulic',
              deletedAt: null,
            },
          ]),
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

  it('引用不可用（不存在/禁用/软删）的 filterId 抛 400，不创建询价', async () => {
    const prisma = makePrisma();
    (prisma as any).customer.findUnique.mockResolvedValue({
      customerId: 'cust-A',
      nickName: 'Alice',
      deletedAt: null,
    });
    // 空结果 = flt-001 不入 ACTIVE_FILTER_WHERE 门禁
    (prisma as any).$transaction = (fn: any) =>
      fn({
        inquiry: {
          findFirst: jest.fn(async () => null),
        },
        inquiryLine: { create: jest.fn() },
        filter: { findMany: jest.fn(async () => []) },
        $executeRaw: () => Promise.resolve(),
      });
    const service = buildService(prisma);
    await expect(
      service.createForCustomer('cust-A', baseDto, baseDto.lines),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InquiriesService 客户状态流转', () => {
  function buildService(prisma: any) {
    const service = new InquiriesService(
      prisma,
      {} as ConfigService,
      {} as SoftDeleteService,
    );
    (service as any).prisma = prisma;
    return service;
  }

  function makeFlowPrisma(status: string) {
    const update = jest.fn((args: any) =>
      Promise.resolve({
        inquiryId: 'inq-001',
        inquiryNo: 'INQ202609-0001',
        status: args.data.status,
        submittedAt: args.data.submittedAt ?? null,
        cancelledAt: args.data.cancelledAt ?? null,
      }),
    );
    return {
      inquiry: {
        findFirst: jest.fn(async () => ({
          inquiryId: 'inq-001',
          inquiryNo: 'INQ202609-0001',
          status,
          deletedAt: null,
        })),
        update,
      },
      $transaction: undefined,
    } as any;
  }

  it('submitForCustomer 本人 draft → submitted 并置 submittedAt', async () => {
    const prisma = makeFlowPrisma('draft');
    const service = buildService(prisma);
    const result = await service.submitForCustomer('cust-A', 'inq-001');
    expect(result.status).toBe('submitted');
    expect(result.submittedAt).toBeInstanceOf(Date);
    expect(prisma.inquiry.update).toHaveBeenCalled();
  });

  it('cancelForCustomer 本人 submitted → cancelled 并置 cancelledAt', async () => {
    const prisma = makeFlowPrisma('submitted');
    const service = buildService(prisma);
    const result = await service.cancelForCustomer('cust-A', 'inq-001');
    expect(result.status).toBe('cancelled');
    expect(result.cancelledAt).toBeInstanceOf(Date);
  });

  it('quoted 询价不可客户取消（抛 409）', async () => {
    const prisma = makeFlowPrisma('quoted');
    const service = buildService(prisma);
    await expect(
      service.cancelForCustomer('cust-A', 'inq-001'),
    ).rejects.toThrow(ConflictException);
  });

  it('非本人询价 submit/cancel 返回 404，不泄露存在性', async () => {
    const prisma = makeFlowPrisma('draft');
    prisma.inquiry.findFirst.mockResolvedValue(null);
    const service = buildService(prisma);
    await expect(
      service.submitForCustomer('cust-A', 'inq-other'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('InquiriesService 详情投影（Inquiry response projection 接缝）', () => {
  function buildService(prisma: any) {
    const service = new InquiriesService(
      prisma,
      {} as ConfigService,
      {} as SoftDeleteService,
    );
    (service as any).prisma = prisma;
    return service;
  }

  const detailRow = {
    id: 7,
    inquiryId: 'inq-001',
    inquiryNo: 'INQ202609-0001',
    title: '采购 320D 液压滤清器',
    description: null,
    status: 'quoted',
    customerName: 'Alice',
    customerEmail: null,
    customerPhone: null,
    totalAmount: null,
    customerId: 'cust-A',
    createdById: null,
    shippingAddressId: null,
    submittedAt: null,
    quotedAt: null,
    expiresAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    deletedAt: null,
    inquiryLines: [
      {
        id: 11,
        inquiryLineId: 'line-1',
        inquiryId: 'inq-001',
        filterId: 'flt-001',
        productName: 'OF-100',
        model: 'OF-100',
        typeName: 'oil',
        quantity: 1,
        unitPrice: '12.50',
        subtotal: '12.50',
        remarks: null,
        sortOrder: 1,
        createdById: null,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        deletedAt: null,
      },
      {
        id: 12,
        inquiryLineId: 'line-2',
        inquiryId: 'inq-001',
        filterId: null,
        productName: '手工填写件',
        model: null,
        typeName: null,
        quantity: 4,
        unitPrice: null,
        subtotal: null,
        remarks: '未报价',
        sortOrder: 2,
        createdById: null,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        deletedAt: null,
      },
    ],
  };

  function makeDetailPrisma() {
    return {
      inquiry: {
        findFirst: jest.fn(async () => detailRow),
        findUnique: jest.fn(async () => detailRow),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    } as any;
  }

  it('详情读取形状携带未软删过滤与稳定排序（排序交给数据库）', async () => {
    const prisma = makeDetailPrisma();
    const service = buildService(prisma);

    await service.findOneForCustomer('cust-A', 'inq-001');

    expect(prisma.inquiry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inquiryId: 'inq-001', customerId: 'cust-A' },
        include: {
          inquiryLines: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    );
  });

  it('Admin 详情使用同一读取形状（共用接缝常量）', async () => {
    const prisma = makeDetailPrisma();
    const service = buildService(prisma);

    await service.findOne('inq-001');

    expect(prisma.inquiry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          inquiryLines: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    );
  });

  it('详情投影保留查询返回的行序、逐行数值化金额，并剔除自增 id', async () => {
    const prisma = makeDetailPrisma();
    const service = buildService(prisma);

    const result = await service.findOneForCustomer('cust-A', 'inq-001');

    expect(result.inquiryLines?.map((l) => l.inquiryLineId)).toEqual([
      'line-1',
      'line-2',
    ]);
    expect(result.inquiryLines?.[0].unitPrice).toBe(12.5);
    expect(typeof result.inquiryLines?.[0].unitPrice).toBe('number');
    expect((result as any).id).toBeUndefined();
    expect((result.inquiryLines?.[0] as any).id).toBeUndefined();
  });

  it('未报价明细在线上为 null（非 0、非字段缺失）', async () => {
    const prisma = makeDetailPrisma();
    const service = buildService(prisma);

    const result = await service.findOneForCustomer('cust-A', 'inq-001');
    const body = JSON.parse(JSON.stringify(result)) as any;

    expect(body.inquiryLines).toHaveLength(2);
    expect(body.inquiryLines[1]).toHaveProperty('unitPrice', null);
    expect(body.inquiryLines[1]).toHaveProperty('subtotal', null);
    expect(body.inquiryLines[1].unitPrice).not.toBe(0);
  });

  it('列表出口不携带 inquiryLines（结构稳定）', async () => {
    const rows = [{ ...detailRow, inquiryLines: undefined }];
    const prisma = {
      inquiry: {
        findFirst: jest.fn(async () => detailRow),
        updateMany: jest.fn(async () => ({ count: 0 })),
        findMany: jest.fn(async () => rows),
        count: jest.fn(async () => 1),
      },
    } as any;
    const service = buildService(prisma);

    const page = await service.findMyInquiries('cust-A', {
      page: 1,
      pageSize: 10,
      getSkip: () => 0,
      getTake: () => 10,
      getOrderBy: () => ({ createdAt: 'desc' }),
    } as any);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('inquiryLines');
  });
});