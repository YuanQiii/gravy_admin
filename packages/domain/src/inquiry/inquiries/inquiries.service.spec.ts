import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, SoftDeleteService } from '@gvray/core';


import { InquiriesService } from './inquiries.service';
import { InquiryPricingService } from '../pricing/inquiry-pricing.service';

// 最小可用的 Prisma 代理：仅 mock 本次涉及的方法。
//
// 事务客户端**只创建一次**并在每次 $transaction 调用中复用，使测试能像生产代码一样
// 断言「读取与写入发生在同一事务内」（收货地址快照的读取已从事务外移入事务内）。
function makePrisma() {
  const tx: any = {
    inquiry: {
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      create: jest.fn((args: any) =>
        Promise.resolve({
          inquiryId: 'inq-001',
          inquiryNo: args.data.inquiryNo,
          customerId: args.data.customerId,
          status: args.data.status,
        }),
      ),
    },
    inquiryLine: {
      create: jest.fn(() => Promise.resolve({ inquiryLineId: 'line-001' })),
      // pricing.recomputeForInquiry 的聚合（接缝内调用）
      aggregate: jest.fn(async () => ({ _sum: { subtotal: null } })),
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
    customerAddress: {
      // 快照读取的唯一入口（resolveShippingSnapshot 内、事务内）
      findUnique: jest.fn(async () => null),
    },
    // 客户快照读取（createForCustomer 内、事务内；P2-3 起无可用性断言）
    customer: {
      findUnique: jest.fn(async () => ({
        nickName: 'Alice',
        email: 'alice@example.com',
        phoneNumber: '13800000000',
      })),
    },
    $executeRaw: () => Promise.resolve(),
  };
  const prisma: any = {
    $transaction: (fn: (tx: any) => Promise<unknown>) => fn(tx),
    customer: { findUnique: jest.fn() },
    inquiry: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async () => ({})),
    },
    inquiryLine: { create: jest.fn() },
    /** 测试用：拿事务客户端的 mock 引用（断言读取/写入的调用面） */
    __tx: tx,
  };
  return prisma as unknown as PrismaService & { __tx: any };
}

/** 一份完整的地址行（快照读取的 select 形状） */
const addressRow = (overrides: Record<string, unknown> = {}) => ({
  customerId: 'cust-A',
  deletedAt: null,
  receiver: '张三',
  phone: '13800000001',
  province: '江苏省',
  city: '无锡市',
  district: '滨湖区',
  detailAddress: '太湖大道 100 号',
  zipCode: '214000',
  ...overrides,
});

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
      new InquiryPricingService(prisma),
    );
    // 注入 base.service 依赖
    (service as any).prisma = prisma;
    return service;
  }

  it('客户行不存在：不 404、不拦截（TTL 内无可用性/存在性断言），按空快照处理', async () => {
    const prisma = makePrisma();
    ((prisma as any).__tx ?? (prisma as any)).customer.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);
    await service.createForCustomer('cust-A', baseDto, baseDto.lines);
    // 空快照落库：customerName/email/phone 均为 null；主体创建仍带登录态 customerId
    expect((prisma as any).__tx.inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'cust-A',
          customerName: null,
          customerEmail: null,
          customerPhone: null,
        }),
      }),
    );
  });

  it('他人 shippingAddressId：归属断言失败抛 400，不创建询价', async () => {
    const prisma = makePrisma();
    (prisma as any).__tx.customer.findUnique.mockResolvedValue({
      nickName: 'Alice',
      email: 'alice@example.com',
      phoneNumber: '13800000000',
    });
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(
      addressRow({ customerId: 'cust-B' }), // 他人
    );
    const service = buildService(prisma);
    await expect(
      service.createForCustomer(
        'cust-A',
        { ...baseDto, shippingAddressId: 'addr-other' },
        baseDto.lines,
      ),
    ).rejects.toThrow(BadRequestException);
    expect((prisma as any).__tx.inquiry.create).not.toHaveBeenCalled();
  });

  it('地址不存在：抛 400（而不是让外键报错 500）', async () => {
    const prisma = makePrisma();
    (prisma as any).__tx.customer.findUnique.mockResolvedValue({
      nickName: 'Alice',
      email: 'alice@example.com',
      phoneNumber: '13800000000',
    });
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);
    await expect(
      service.createForCustomer(
        'cust-A',
        { ...baseDto, shippingAddressId: 'addr-gone' },
        baseDto.lines,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // CustomerAddress 已改为有意硬删（unify-soft-delete-mechanics / ADR 0016）：
  // 不存在"已软删地址"状态 —— 被删地址物理不存在，findUnique 返回 null，
  // 由上面的「地址不存在：抛 400」用例覆盖同一失败路径。

  it('本人 shippingAddressId：事务内创建主体+明细行，并写入 7 字段快照', async () => {
    const prisma = makePrisma();
    (prisma as any).customer.findUnique.mockResolvedValue({
      customerId: 'cust-A',
      nickName: 'Alice',
      email: 'alice@example.com',
      phoneNumber: '13800000000',
      deletedAt: null,
    });
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(
      addressRow(),
    );

    const service = buildService(prisma);
    const result = await service.createForCustomer(
      'cust-A',
      { ...baseDto, shippingAddressId: 'addr-own' },
      baseDto.lines,
    );

    expect(result.inquiryNo).toMatch(/^INQ\d{6}-\d{6}$/);
    expect(result.status).toBe('draft');

    // 快照读取发生在**事务客户端**上（与主体写入同一事务，无 TOCTOU 窗口）
    expect((prisma as any).__tx.customerAddress.findUnique).toHaveBeenCalledWith(
      {
        where: { addressId: 'addr-own' },
        select: expect.any(Object),
      },
    );

    // 主体创建：customerId 取自首参（非客户端指定）、createdById 为空、快照取自被引用地址
    const data = (prisma as any).__tx.inquiry.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        customerId: 'cust-A',
        createdById: null,
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
        customerPhone: '13800000000',
        shippingAddressId: 'addr-own',
        shippingReceiver: '张三',
        shippingPhone: '13800000001',
        shippingProvince: '江苏省',
        shippingCity: '无锡市',
        shippingDistrict: '滨湖区',
        shippingDetailAddress: '太湖大道 100 号',
        shippingZipCode: '214000',
      }),
    );
  });

  it('未提供 shippingAddressId：快照字段不写入（落库为 NULL），引用显式为 null', async () => {
    const prisma = makePrisma();
    (prisma as any).__tx.customer.findUnique.mockResolvedValue({
      nickName: 'Alice',
      email: 'alice@example.com',
      phoneNumber: '13800000000',
    });
    const service = buildService(prisma);
    await service.createForCustomer('cust-A', { ...baseDto }, baseDto.lines);

    const data = (prisma as any).__tx.inquiry.create.mock.calls[0][0].data;
    expect(data.shippingAddressId).toBeNull();
    for (const key of [
      'shippingReceiver',
      'shippingPhone',
      'shippingProvince',
      'shippingCity',
      'shippingDistrict',
      'shippingDetailAddress',
      'shippingZipCode',
    ]) {
      // 不传 key 时由 Prisma 落 NULL（DTO 声明为 string | null，读回来仍是 null）
      expect(data).not.toHaveProperty(key);
    }
    expect(
      (prisma as any).__tx.customerAddress.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('管理端 create：同样写入快照；地址不存在抛 400 而非 500', async () => {
    const prisma = makePrisma();
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(
      addressRow(),
    );
    const service = buildService(prisma);

    await service.create({
      title: '代客下单',
      shippingAddressId: 'addr-own',
    } as any);

    const data = (prisma as any).__tx.inquiry.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        shippingAddressId: 'addr-own',
        shippingReceiver: '张三',
        shippingZipCode: '214000',
      }),
    );

    // 地址不存在 → 400
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(null);
    await expect(
      service.create({
        title: '代客下单',
        shippingAddressId: 'addr-gone',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('管理端 create：错挂他人地址 → 400（P2-4 起归属校验生效）', async () => {
    const prisma = makePrisma();
    // 地址属于他人：管理端现在传 `dto.customerId` 作为 owner，因此必须被拒
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(
      addressRow({ customerId: 'cust-OTHER' }),
    );
    const service = buildService(prisma);

    await expect(
      service.create({
        title: '代客下单',
        customerId: 'cust-A',
        shippingAddressId: 'addr-other-customer',
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect((prisma as any).__tx.inquiry.create).not.toHaveBeenCalled();
  });

  it('管理端 create：地址归属该客户时通过', async () => {
    const prisma = makePrisma();
    (prisma as any).__tx.customerAddress.findUnique.mockResolvedValue(
      addressRow({ customerId: 'cust-A' }),
    );
    const service = buildService(prisma);

    await expect(
      service.create({
        title: '代客下单',
        customerId: 'cust-A',
        shippingAddressId: 'addr-own',
      } as any),
    ).resolves.toBeDefined();

    expect((prisma as any).__tx.inquiry.create).toHaveBeenCalled();
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
    // 空结果 = flt-001 不入 ACTIVE_FILTER_WHERE 门禁
    (prisma as any).$transaction = (fn: any) =>
      fn({
        // 客户快照读取（事务内；P2-3 起无可用性断言）
        customer: {
          findUnique: jest.fn(async () => ({
            nickName: 'Alice',
            email: 'alice@example.com',
            phoneNumber: '13800000000',
          })),
        },
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
      new InquiryPricingService(prisma),
    );
    (service as any).prisma = prisma;
    return service;
  }

  /**
   * 流转用例的 Prisma 代理：模拟**接缝**的调用面 —— 条件写（`updateMany`）+
   * 回读（`findUnique`）+ 失败归因重读（`findFirst`）。
   *
   * - `count` 控制条件写的影响行数（0 = 前置状态已失效）
   * - `currentStatus` 控制**第二次** `findFirst` 返回的状态（即并发改变后的现状）
   * - `findFirstNull` 模拟"单据不存在/不在作用域内"
   */
  function makeFlowPrisma(
    status: string,
    overrides: {
      count?: number;
      currentStatus?: string;
      findFirstNull?: boolean;
    } = {},
  ) {
    const state = { patch: {} as any };
    let findFirstCalls = 0;

    const updateMany = jest.fn(async (args: any) => {
      state.patch = args.data;
      return { count: overrides.count ?? 1 };
    });

    const findFirst = jest.fn(async () => {
      if (overrides.findFirstNull) return null;
      const current =
        findFirstCalls++ === 0
          ? status
          : (overrides.currentStatus ?? status);
      return {
        inquiryId: 'inq-001',
        inquiryNo: 'INQ202609-000001',
        status: current,
        deletedAt: null,
      };
    });

    // `findUnique` 被两种语义复用：① `updateStatus` 的前置读取（当前状态）；
    // ② 接缝写入后的回读（写入结果）。按"是否已发生写入"区分，而不是调用次序
    // —— 客户路径不调前置 `findUnique`，两次调用序不同。
    const inquiryUpdate = jest.fn(async () => ({}));
    const lineAggregate = jest.fn(async () => ({ _sum: { subtotal: null } }));
    const findUnique = jest.fn(async () =>
      Object.keys(state.patch).length > 0
        ? {
            inquiryId: 'inq-001',
            inquiryNo: 'INQ202609-000001',
            submittedAt: null,
            cancelledAt: null,
            ...state.patch,
          }
        : {
            inquiryId: 'inq-001',
            inquiryNo: 'INQ202609-000001',
            status: overrides.currentStatus ?? status,
            deletedAt: null,
            submittedAt: null,
            cancelledAt: null,
          },
    );

    return {
      inquiry: { findFirst, findUnique, updateMany, update: inquiryUpdate },
      inquiryLine: { aggregate: lineAggregate },
      $transaction: undefined,
    } as any;
  }

  it('submitForCustomer 本人 draft → submitted 并置 submittedAt（条件写带前置状态）', async () => {
    const prisma = makeFlowPrisma('draft');
    const service = buildService(prisma);
    const result = await service.submitForCustomer('cust-A', 'inq-001');

    expect(result.status).toBe('submitted');
    expect(result.submittedAt).toBeInstanceOf(Date);
    // 原子性依据：where 必须带前置状态与软删条件
    expect(prisma.inquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inquiryId: 'inq-001', status: 'draft', deletedAt: null },
        data: expect.objectContaining({ status: 'submitted' }),
      }),
    );
  });

  it('cancelForCustomer 本人 submitted → cancelled 并置 cancelledAt', async () => {
    const prisma = makeFlowPrisma('submitted');
    const service = buildService(prisma);
    const result = await service.cancelForCustomer('cust-A', 'inq-001');

    expect(result.status).toBe('cancelled');
    expect(result.cancelledAt).toBeInstanceOf(Date);
  });

  it('失效更新：前置状态已被并发改变 → 409，且不写入任何字段', async () => {
    // 读到 draft，但条件写影响 0 行（此时库中已是 cancelled）
    const prisma = makeFlowPrisma('draft', {
      count: 0,
      currentStatus: 'cancelled',
    });
    const service = buildService(prisma);

    await expect(
      service.submitForCustomer('cust-A', 'inq-001'),
    ).rejects.toThrow(ConflictException);

    // 接缝只做条件写与回读归因，409 路径不存在「按 inquiryId 无条件 update」的退路
    expect(prisma.inquiry.update).not.toHaveBeenCalled();
  });

  it('重复提交：已 submitted 再提交 → 409，且不触达写入', async () => {
    const prisma = makeFlowPrisma('submitted');
    const service = buildService(prisma);

    await expect(
      service.submitForCustomer('cust-A', 'inq-001'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.inquiry.updateMany).not.toHaveBeenCalled();
  });

  it('管理端 updateStatus 流转到 quoted：写 quotedAt / expiresAt / updatedById', async () => {
    const prisma = makeFlowPrisma('submitted');
    const service = buildService(prisma);

    const result = await service.updateStatus(
      'inq-001',
      'quoted',
      { expiresAt: '2026-12-31' } as any,
      'admin-1',
    );

    expect(result.status).toBe('quoted');
    expect(result.quotedAt).toBeInstanceOf(Date);
    expect(prisma.inquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inquiryId: 'inq-001', status: 'submitted', deletedAt: null },
        data: expect.objectContaining({
          status: 'quoted',
          updatedById: 'admin-1',
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('管理端 updateStatus 不传 expiresAt：不写该字段（不是清空）', async () => {
    const prisma = makeFlowPrisma('submitted');
    const service = buildService(prisma);

    await service.updateStatus('inq-001', 'quoted', undefined, 'admin-1');

    const patch = prisma.inquiry.updateMany.mock.calls[0][0].data;
    expect(patch).not.toHaveProperty('expiresAt');
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
      new InquiryPricingService(prisma),
    );
    (service as any).prisma = prisma;
    return service;
  }

  const detailRow = {
    id: 7,
    inquiryId: 'inq-001',
    inquiryNo: 'INQ202609-000001',
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

describe('nextInquiryNo（编号推导深模块 · 6 位 + 数值比较）', () => {
  function buildNumberService(prisma: any) {
    const service = new InquiriesService(
      prisma,
      {} as ConfigService,
      {} as SoftDeleteService,
      new InquiryPricingService(prisma),
    );
    (service as any).prisma = prisma;
    return service;
  }

  /** tx mock：`findFirst` 返回当月最大编号，`$executeRaw` 吞掉 advisory lock */
  function makeNumberPrisma(lastInquiryNo: string | null) {
    return {
      inquiry: {
        findFirst: jest.fn(async () =>
          lastInquiryNo ? { inquiryNo: lastInquiryNo } : null,
        ),
      },
      $executeRaw: jest.fn(async () => 0),
    } as any;
  }

  it('首单（当月无记录）→ 6 位 000001', async () => {
    const prisma = makeNumberPrisma(null);
    const service = buildNumberService(prisma);

    const candidate = await (service as any).nextInquiryNo(
      prisma,
      'INQ202608-',
    );

    expect(candidate).toBe('INQ202608-000001');
    expect(candidate).toHaveLength('INQ202608-'.length + 6);
  });

  it('当月已有 9999 条：第 10000 单为 -010000（不再受 4 位宽度限制）', async () => {
    const prisma = makeNumberPrisma('INQ202608-009999');
    const service = buildNumberService(prisma);

    const candidate = await (service as any).nextInquiryNo(
      prisma,
      'INQ202608-',
    );

    expect(candidate).toBe('INQ202608-010000');
  });

  it('数值比较：存在 -010000 时按 10000 递增（字典序会误判 -9999 更大）', async () => {
    // 字典序下 "INQ202608-010000" < "INQ202608-009999"，orderBy desc 会取错行；
    // 这里直接给出门面查询会取到的“字典序最大”行，断言推导仍按数值走到 10001
    const prisma = makeNumberPrisma('INQ202608-010000');
    const service = buildNumberService(prisma);

    const candidate = await (service as any).nextInquiryNo(
      prisma,
      'INQ202608-',
    );

    expect(candidate).toBe('INQ202608-010001');
  });

  it('advisory lock 针对派生出的候选号加锁', async () => {
    const prisma = makeNumberPrisma('INQ202608-009999');
    const service = buildNumberService(prisma);

    await (service as any).nextInquiryNo(prisma, 'INQ202608-');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$executeRaw.mock.calls[0][0];
    expect(String(sql)).toContain('pg_advisory_xact_lock');
  });
});

describe('InquiriesService 过期语义（resolve-inquiry-expiry-semantics）', () => {
  function build(prisma: any) {
    const service = new InquiriesService(
      prisma,
      {} as ConfigService,
      {} as SoftDeleteService,
      new InquiryPricingService(prisma),
    );
    (service as any).prisma = prisma;
    return service;
  }

  function readPrisma(quotedRow: Record<string, unknown>) {
    const updateMany = jest.fn(async () => ({ count: 0 }));
    const update = jest.fn(async () => ({}));
    return {
      prisma: {
        inquiry: {
          findFirst: jest.fn(async () => quotedRow),
          findUnique: jest.fn(async () => quotedRow),
          findMany: jest.fn(async () => [quotedRow]),
          count: jest.fn(async () => 1),
          updateMany,
          update,
        },
        inquiryLine: {
          aggregate: jest.fn(async () => ({ _sum: { subtotal: null } })),
        },
        $transaction: (fn: any) => fn({ inquiryLine: { aggregate: jest.fn() } }),
      },
      updateMany,
      update,
    } as any;
  }

  const NOW = new Date('2026-09-17T12:00:00Z');
  const realNow = Date.now;

  beforeEach(() => {
    Date.now = () => NOW.getTime();
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    Date.now = realNow;
    jest.useRealTimers();
  });

  it('读路径不写：findMyInquiries / findAll 不触发任何 updateMany/update（1.2）', async () => {
    const quotedRow = {
      inquiryId: 'inq-1', inquiryNo: 'INQ202609-000001', status: 'quoted',
      expiresAt: new Date('2026-09-17T11:00:00Z'), deletedAt: null, createdAt: NOW, updatedAt: NOW,
    };
    for (const read of ['myList', 'adminList'] as const) {
      const h = readPrisma(quotedRow);
      const service = build(h.prisma);
      const q = { page: 1, pageSize: 10, getSkip: () => 0, getTake: () => 10, getOrderBy: () => ({ createdAt: 'desc' }) } as any;
      if (read === 'myList') {
        await service.findMyInquiries('cust-A', q);
      } else {
        await service.findAll(q);
      }
      expect(h.updateMany).not.toHaveBeenCalled();
      expect(h.update).not.toHaveBeenCalled();
    }
  });

  it('投影派生 isExpired 四态（2.2）：quoted+过期 true；quoted+未过期 false；非 quoted false；quoted+null false', async () => {
    const mk = (status: string, expiresAt: Date | null) => ({
      inquiryId: 'inq-1', inquiryNo: 'INQ202609-000001', status,
      expiresAt, deletedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    const cases: Array<[Record<string, unknown>, boolean]> = [
      [mk('quoted', new Date('2026-09-17T11:00:00Z')), true],
      [mk('quoted', new Date('2026-09-17T13:00:00Z')), false],
      [mk('submitted', new Date('2026-09-17T11:00:00Z')), false],
      [mk('quoted', null), false],
    ];
    for (const [row, expected] of cases) {
      const h = readPrisma(row);
      const service = build(h.prisma);
      const detail = await service.findOneForCustomer('cust-A', 'inq-1');
      expect(detail.isExpired).toBe(expected);
    }
  });
});
